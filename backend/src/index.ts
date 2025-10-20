import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import sgMail from '@sendgrid/mail'
import fs from 'fs'
import path from 'path'
import type { Server, ServerWebSocket } from 'bun'
import { filesDBClient } from './filesdb-client'
import { enhancedFilesDBClient } from './filesdb-client-enhanced'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

type ProgressSocketData = {
  clipboardId?: string
}

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

// WebSocket connections tracking
const progressConnections = new Map<string, Set<ServerWebSocket<ProgressSocketData>>>()

// Start progress monitoring for a clipboard item
async function startProgressMonitoring(clipboardId: string) {
  const connections = progressConnections.get(clipboardId)
  if (!connections || connections.size === 0) return

  const interval = setInterval(async () => {
    try {
      const status = await filesDBClient.getUploadStatus(clipboardId)
      const fileInfo = await filesDBClient.getFileInfo(clipboardId).catch(() => null)

      const progressData = {
        type: 'progress',
        clipboard_id: clipboardId,
        file_id: clipboardId,
        status: status.status,
        completed: status.completed,
        progress: status.progress || {},
        chunks_received: status.chunks_received || 0,
        total_chunks: status.total_chunks || 0,
        chunks_uploaded_to_blockchain: status.chunks_uploaded_to_blockchain || 0,
        progress_percentage: status.progress_percentage || 0,
        error: status.error,
        file_info: status.file_info || (fileInfo ? {
          original_filename: fileInfo.original_filename,
          file_size: fileInfo.total_size,
          content_type: fileInfo.content_type,
          owner: fileInfo.owner
        } : null)
      }

      // Send to all connected clients for this clipboard
      const activeConnections = progressConnections.get(clipboardId)
      if (activeConnections) {
        for (const ws of activeConnections) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(progressData))
          } else {
            activeConnections.delete(ws)
          }
        }

        // Clean up if no active connections
        if (activeConnections.size === 0) {
          progressConnections.delete(clipboardId)
        }
      }

      // Stop monitoring if completed or failed
      if (status.completed || status.status === 'failed') {
        clearInterval(interval)
        // Keep connection for a bit longer in case client wants final status
        setTimeout(() => {
          const connections = progressConnections.get(clipboardId)
          if (connections) {
            for (const ws of connections) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.close()
              }
            }
            progressConnections.delete(clipboardId)
          }
        }, 5000)
      }
    } catch (error) {
      console.error(`Progress monitoring error for ${clipboardId}:`, error)

      // Send error to clients
      const activeConnections = progressConnections.get(clipboardId)
      if (activeConnections) {
        const message = getErrorMessage(error)
        const errorData = {
          type: 'error',
          clipboard_id: clipboardId,
          error: 'Failed to fetch progress: ' + message
        }

        for (const ws of activeConnections) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(errorData))
          }
        }
      }
    }
  }, 1000) // Poll every second for WebSocket (more frequent than HTTP polling)
}

const app = new Hono<{ Bindings: { server: Server } }>()

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@copypal.online'

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

// Health check endpoint
app.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
})

// WebSocket endpoint for progress updates
app.get('/ws/progress', async (c) => {
  const server = c.env.server
  if (typeof server.upgrade === 'function' && server.upgrade(c.req.raw)) {
    return new Response(null)
  }
  return c.text('WebSocket upgrade failed', 400)
})

// Email sending function
async function sendMagicLinkEmail(email: string, code: string): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.log(`Magic link code for ${email}: ${code}`)
    return true // Return true in dev mode
  }

  try {
    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: 'Your CopyPal Login Code',
      text: `Your login code is: ${code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #20C15A;">CopyPal Login Code</h2>
          <p>Your login code is:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #666;">This code will expire in 10 minutes.</p>
          <p style="color: #666;">If you didn't request this code, please ignore this email.</p>
        </div>
      `
    }

    await sgMail.send(msg)
    console.log(`Magic link email sent to ${email}`)
    return true
  } catch (error) {
    console.error('Failed to send email:', error)
    return false
  }
}

// CORS configuration
app.use('/*', cors({
  origin: [
    'https://copypal.online',
    'http://copypal.online',
    'http://localhost:5173',
    'http://localhost:8881'
  ],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// In-memory storage (use Redis/DB in production)
interface AuthSession {
  email: string
  code: string
  createdAt: number
  verified: boolean
}

interface UserSession {
  id: string
  email?: string
  walletAddress?: string
  createdAt: number
}

const authSessions = new Map<string, AuthSession>()
const userSessions = new Map<string, UserSession>()

// File paths for persistent storage
const DATA_DIR = process.env.DATA_DIR || '/tmp'
const SESSIONS_FILE = path.join(DATA_DIR, 'user-sessions.json')

// Load/save sessions to disk
const loadUserSessions = () => {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8')
      const sessions: Array<[string, UserSession]> = JSON.parse(data)
      userSessions.clear()
      sessions.forEach(([key, value]) => userSessions.set(key, value))
      console.log(`Loaded ${sessions.length} user sessions from disk`)
    }
  } catch (err) {
    console.error('Failed to load user sessions:', err)
  }
}

const saveUserSessions = () => {
  try {
    // Ensure data directory exists
    fs.mkdirSync(DATA_DIR, { recursive: true })

    const sessions = Array.from(userSessions.entries())
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2))
  } catch (err) {
    console.error('Failed to save user sessions:', err)
  }
}

// Load sessions on startup
loadUserSessions()

// Validation schemas
const requestMagicLinkSchema = z.object({
  email: z.string().email()
})

const verifyMagicLinkSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6)
})

const clipboardSchema = z.object({
  kind: z.enum(['text', 'file']).default('text'),
  content: z.string().min(1).max(10000),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().optional(),
  fileData: z.string().optional(), // Base64 encoded file data
  expiresAt: z.string().datetime().optional(),
  ttlDays: z.number().min(1).max(30).default(7) // TTL in days, 1-30 days
})

// Health check endpoint
app.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
})

// Auth endpoints
app.post('/v1/auth/request', async (c) => {
  try {
    const body = await c.req.json()
    const { email } = requestMagicLinkSchema.parse(body)

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // Store auth session
    authSessions.set(email, {
      email,
      code,
      createdAt: Date.now(),
      verified: false
    })

    // Send email
    const emailSent = await sendMagicLinkEmail(email, code)

    if (!emailSent && SENDGRID_API_KEY) {
      return c.json({
        error: 'Failed to send email. Please try again.',
        success: false
      }, 500)
    }

    return c.json({
      message: 'Magic link sent to your email',
      success: true
    })
  } catch (error) {
    console.error('Auth request error:', error)
    return c.json({
      error: 'Invalid request',
      success: false
    }, 400)
  }
})

app.post('/v1/auth/verify', async (c) => {
  try {
    const body = await c.req.json()
    const { email, code } = verifyMagicLinkSchema.parse(body)

    const authSession = authSessions.get(email)
    if (!authSession) {
      return c.json({
        error: 'Invalid or expired session',
        success: false
      }, 400)
    }

    // Check if code is correct and not expired (5 minutes)
    const fiveMinutes = 5 * 60 * 1000
    if (authSession.code !== code || Date.now() - authSession.createdAt > fiveMinutes) {
      return c.json({
        error: 'Invalid or expired code',
        success: false
      }, 400)
    }

    // Mark as verified and create user session
    authSession.verified = true
    const sessionId = nanoid()
    const userSession: UserSession = {
      id: sessionId,
      email,
      createdAt: Date.now()
    }

    userSessions.set(sessionId, userSession)
    saveUserSessions()

    return c.json({
      success: true,
      sessionId,
      user: { email }
    })
  } catch (error) {
    console.error('Auth verify error:', error)
    return c.json({
      error: 'Invalid request',
      success: false
    }, 400)
  }
})

app.get('/v1/auth/session', async (c) => {
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!sessionId) {
    return c.json({ error: 'No session provided', success: false }, 401)
  }

  const userSession = userSessions.get(sessionId)
  if (!userSession) {
    return c.json({ error: 'Invalid session', success: false }, 401)
  }

  const user = userSession.email
    ? { email: userSession.email }
    : { walletAddress: userSession.walletAddress }

  return c.json({
    success: true,
    user
  })
})

app.post('/v1/auth/logout', async (c) => {
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
  if (sessionId) {
    userSessions.delete(sessionId)
    saveUserSessions()
  }

  return c.json({ success: true })
})

// Wallet authentication
app.post('/v1/auth/wallet', async (c) => {
  try {
    const body = await c.req.json()
    const { walletAddress, signature, message } = body

    if (!walletAddress || !signature || !message) {
      return c.json({ error: 'Missing required fields', success: false }, 400)
    }

    // In a real implementation, you would verify the signature here
    // For now, we'll accept any valid-looking wallet address
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return c.json({ error: 'Invalid wallet address', success: false }, 400)
    }

    // For now, we'll skip signature verification and trust the frontend
    // In production, you should verify the signature matches the message and wallet

    const sessionId = nanoid()
    const userSession: UserSession = {
      id: sessionId,
      walletAddress,
      createdAt: Date.now()
    }

    userSessions.set(sessionId, userSession)
    saveUserSessions()

    return c.json({
      success: true,
      sessionId,
      user: { walletAddress }
    })
  } catch (error) {
    console.error('Wallet auth error:', error)
    return c.json({ error: 'Authentication failed', success: false }, 500)
  }
})

// File chunking function for large files
async function uploadFileWithChunking(buffer: Buffer, fileName: string, fileType: string, ttlDays: number, owner?: string): Promise<string> {
  const CHUNK_SIZE = 512 * 1024 // 512KB
  const totalSize = buffer.length
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE)

  console.log(`Chunking large file: ${fileName} (${totalSize} bytes) into ${totalChunks} chunks`)

  // Upload each chunk
  const chunkIds: string[] = []
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, totalSize)
    const chunkBuffer = buffer.slice(start, end)

    const chunkFileName = `${fileName}.chunk.${i}`
    console.log(`Uploading chunk ${i + 1}/${totalChunks} (${chunkBuffer.length} bytes)`)

    try {
      const chunkId = await filesDBClient.uploadFile(chunkBuffer, chunkFileName, 'application/octet-stream', ttlDays, owner)
      chunkIds.push(chunkId)
      console.log(`Chunk ${i + 1}/${totalChunks} uploaded: ${chunkId}`)
    } catch (error) {
      const message = getErrorMessage(error)
      console.error(`Failed to upload chunk ${i + 1}:`, error)
      throw new Error(`Failed to upload chunk ${i + 1}: ${message}`)
    }
  }

  // Create metadata file with chunk information
  const metadata = {
    originalFileName: fileName,
    originalFileType: fileType,
    totalSize,
    totalChunks,
    chunkSize: CHUNK_SIZE,
    chunkIds,
    createdAt: new Date().toISOString()
  }

  const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2))
  const metadataId = await filesDBClient.uploadFile(metadataBuffer, `${fileName}.metadata.json`, 'application/json', ttlDays, owner)

  console.log(`Metadata uploaded: ${metadataId}`)
  console.log(`Large file chunking completed: ${fileName} -> ${metadataId}`)

  return metadataId
}

// File assembly function for chunked files
async function downloadFileFromChunks(metadataId: string): Promise<{ data: Buffer, info: any }> {
  // Download metadata
  const { data: metadataBuffer } = await filesDBClient.downloadFile(metadataId)
  const metadata = JSON.parse(metadataBuffer.toString())

  console.log(`Assembling chunked file: ${metadata.originalFileName} from ${metadata.totalChunks} chunks`)

  // Download all chunks
  const chunks: Buffer[] = []
  for (let i = 0; i < metadata.totalChunks; i++) {
    const chunkId = metadata.chunkIds[i]
    console.log(`Downloading chunk ${i + 1}/${metadata.totalChunks}: ${chunkId}`)

    try {
      const { data: chunkBuffer } = await filesDBClient.downloadFile(chunkId)
      chunks.push(chunkBuffer)
    } catch (error) {
      const message = getErrorMessage(error)
      console.error(`Failed to download chunk ${i + 1}:`, error)
      throw new Error(`Failed to download chunk ${i + 1}: ${message}`)
    }
  }

  // Combine chunks
  const combinedBuffer = Buffer.concat(chunks)

  if (combinedBuffer.length !== metadata.totalSize) {
    throw new Error(`File size mismatch: expected ${metadata.totalSize}, got ${combinedBuffer.length}`)
  }

  console.log(`File assembly completed: ${metadata.originalFileName} (${combinedBuffer.length} bytes)`)

  // Return assembled file with metadata info
  return {
    data: combinedBuffer,
    info: {
      original_filename: metadata.originalFileName,
      content_type: metadata.originalFileType,
      total_size: metadata.totalSize,
      created_at: metadata.createdAt,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Default 7 days
    }
  }
}

// Clipboard endpoints
app.post('/v1/clipboard', async (c) => {
  try {
    const body = await c.req.json()
    const { kind, content, fileName, fileType, fileData, expiresAt: expiresAtStr, ttlDays } = clipboardSchema.parse(body)

    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
    const userSession = sessionId ? userSessions.get(sessionId) : null

    // Use TTL from request or calculate from expiresAt
    let effectiveTtlDays = ttlDays;
    if (expiresAtStr) {
      const expiresAt = new Date(expiresAtStr).getTime()
      const now = Date.now()
      const calculatedTtl = Math.max(1, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)))
      effectiveTtlDays = ttlDays ? Math.min(ttlDays, calculatedTtl) : calculatedTtl
    }

    // Use user session ID as owner for FileDB
    const owner = userSession?.id

    // Store via FilesDB with owner annotation
    let fileId: string;
    if (kind === 'text') {
      fileId = await filesDBClient.uploadText(content, 'clipboard.txt', effectiveTtlDays, owner)
    } else if (kind === 'file' && fileData) {
      const buffer = Buffer.from(fileData, 'base64')

      // Check if file needs chunking (>512KB)
      const CHUNK_SIZE = 512 * 1024 // 512KB
      console.log(`File size: ${buffer.length} bytes, chunk size threshold: ${CHUNK_SIZE}`)
      if (buffer.length > CHUNK_SIZE) {
        console.log(`File needs chunking, starting chunking process...`)
        fileId = await uploadFileWithChunking(buffer, fileName || 'file', fileType || 'application/octet-stream', effectiveTtlDays, owner)
      } else {
        console.log(`File is small enough, using direct upload...`)
        fileId = await filesDBClient.uploadFile(buffer, fileName || 'file', fileType || 'application/octet-stream', effectiveTtlDays, owner)
      }
    } else {
      throw new Error('Invalid clipboard item')
    }

    console.log(`File uploaded to FileDB: ${fileId}, waiting for blockchain upload...`)

    // Wait for blockchain upload to complete (with timeout)
    let uploadCompleted = false
    let entities: any = null
    const maxWaitTime = 30000 // 30 seconds
    const startTime = Date.now()

    while (!uploadCompleted && (Date.now() - startTime) < maxWaitTime) {
      try {
        const status = await filesDBClient.getUploadStatus(fileId)

        // Enhanced progress logging with timing estimates
        const progressInfo = status.progress || {}
        const chunks = progressInfo.chunks_uploaded || status.chunks_uploaded_to_blockchain || 0
        const totalChunks = progressInfo.total_chunks || status.total_chunks || 0
        const percentage = progressInfo.percentage || status.progress_percentage || 0
        const elapsed = progressInfo.elapsed_seconds || 0
        const estimated = progressInfo.estimated_remaining_seconds

        let progressMsg = `Upload progress for ${fileId}: ${chunks}/${totalChunks} chunks (${percentage}%)`
        if (elapsed > 0) {
          progressMsg += `, elapsed: ${elapsed}s`
        }
        if (estimated) {
          progressMsg += `, remaining: ~${estimated}s`
        }
        if (progressInfo.last_chunk_uploaded_at) {
          const lastUpload = new Date(progressInfo.last_chunk_uploaded_at)
          const timeSinceLastUpload = Math.round((Date.now() - lastUpload.getTime()) / 1000)
          progressMsg += `, last upload: ${timeSinceLastUpload}s ago`
        }

        console.log(progressMsg)

        if (status.completed && status.status === 'completed') {
          uploadCompleted = true
          entities = await filesDBClient.getFileEntityKeys(fileId)
          break
        } else if (status.status === 'failed') {
          throw new Error(`FileDB blockchain upload failed: ${status.error}`)
        }

        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        const message = getErrorMessage(error)
        console.log(`Waiting for blockchain upload... (${Math.round((Date.now() - startTime) / 1000)}s)`, message)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    const frontendUrl = process.env.BASE_URL
      ? process.env.BASE_URL.replace('/api', '')
      : 'http://localhost:5173'

    // If blockchain upload completed, return full blockchain info
    if (uploadCompleted && entities) {
      const blockchainEntityKey = entities.metadata_entity_key

      return c.json({
        success: true,
        id: fileId,
        entityKey: blockchainEntityKey,
        fileId: fileId,
        ttlDays: effectiveTtlDays,
        url: `${frontendUrl}/c/${fileId}`,
        explorerUrl: `https://explorer.kaolin.hoodi.arkiv.network/entity/${blockchainEntityKey}`,
        blockchainInfo: {
          metadataEntity: entities.metadata_entity_key,
          chunkEntities: entities.chunk_entity_keys,
          totalEntities: entities.total_entities,
          explorerUrls: {
            metadata: `https://explorer.kaolin.hoodi.arkiv.network/entity/${entities.metadata_entity_key}`,
            chunks: entities.chunk_entity_keys.map((chunkKey: string) =>
              `https://explorer.kaolin.hoodi.arkiv.network/entity/${chunkKey}`
            )
          }
        },
        status: 'completed'
      })
    } else {
      // Blockchain upload still in progress, return basic info
      return c.json({
        success: true,
        id: fileId,
        fileId: fileId,
        ttlDays: effectiveTtlDays,
        url: `${frontendUrl}/c/${fileId}`,
        status: 'uploading',
        message: 'File uploaded to FileDB, blockchain upload in progress. Entity keys will be available once upload completes.'
      })
    }
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Clipboard create error:', error)
    return c.json({
      error: 'Failed to store in FileDB: ' + message,
      success: false
    }, 500)
  }
})

app.get('/v1/clipboard/:id', async (c) => {
  const fileId = c.req.param('id')

  try {
    const info = await filesDBClient.getFileInfo(fileId)

    if (info.content_type?.startsWith('text/plain')) {
      // Text clipboard
      const content = await filesDBClient.downloadText(fileId)
      return c.json({
        success: true,
        kind: 'text',
        content,
        createdAt: new Date(info.created_at).getTime(),
        expiresAt: new Date(info.expires_at).getTime()
      })
    } else {
      // Check if this is a chunked file (metadata file)
      const isChunkedFile = info.original_filename?.endsWith('.metadata.json')

      let data: Buffer, fileInfo: any
      if (isChunkedFile) {
        // Assemble chunked file
        const assembled = await downloadFileFromChunks(fileId)
        data = assembled.data
        fileInfo = assembled.info
      } else {
        // Regular file
        const downloadResult = await filesDBClient.downloadFile(fileId)
        data = downloadResult.data
        fileInfo = info
      }

      const fileData = data.toString('base64')

      return c.json({
        success: true,
        kind: 'file',
        content: fileInfo.original_filename,
        fileName: fileInfo.original_filename,
        fileType: fileInfo.content_type,
        fileSize: fileInfo.total_size,
        fileData,
        isChunked: isChunkedFile,
        createdAt: new Date(fileInfo.created_at).getTime(),
        expiresAt: new Date(fileInfo.expires_at).getTime()
      })
    }
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Clipboard get error:', error)
    return c.json({
      error: 'Failed to retrieve from FilesDB: ' + message,
      success: false
    }, 500)
  }
})

// Get user's clipboard items - disabled for now as FilesDB doesn't have user-specific listing
app.get('/v1/clipboard/user/items', async (c) => {
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!sessionId) {
    return c.json({ error: 'No session provided', success: false }, 401)
  }

  const userSession = userSessions.get(sessionId)
  if (!userSession) {
    return c.json({ error: 'Invalid session', success: false }, 401)
  }

  try {
    // Get user's files by owner annotation
    const files = await filesDBClient.getFilesByOwner(userSession.id)

    const userItems = files.map(file => ({
      id: file.file_id,
      kind: file.content_type?.startsWith('text/') ? 'text' : 'file',
      content: file.content_type?.startsWith('text/') ? '' : '',
      fileName: file.original_filename,
      fileType: file.content_type,
      fileSize: file.total_size,
      createdAt: new Date(file.created_at).getTime(),
      expiresAt: new Date(file.expires_at).getTime()
    }))

    // Sort by creation date (newest first)
    userItems.sort((a, b) => b.createdAt - a.createdAt)

    return c.json({
      success: true,
      items: userItems
    })
  } catch (error) {
    console.error('Get user items error:', error)
    return c.json({
      error: 'Failed to retrieve user items from FilesDB',
      success: false
    }, 500)
  }
})

// File download endpoint
app.get('/v1/clipboard/:id/download', async (c) => {
  const fileId = c.req.param('id')

  try {
    // First get file info to check if it's chunked
    const info = await filesDBClient.getFileInfo(fileId)
    const isChunkedFile = info.original_filename?.endsWith('.metadata.json')

    let data: Buffer, fileInfo: any
    if (isChunkedFile) {
      // Assemble chunked file
      const assembled = await downloadFileFromChunks(fileId)
      data = assembled.data
      fileInfo = assembled.info
    } else {
      // Regular file download
      const downloadResult = await filesDBClient.downloadFile(fileId)
      data = downloadResult.data
      fileInfo = downloadResult.info
    }

    // Set appropriate headers
    c.header('Content-Type', fileInfo.content_type || 'application/octet-stream')
    c.header('Content-Disposition', `attachment; filename="${fileInfo.original_filename}"`)
    c.header('Content-Length', data.length.toString())

    return c.body(bufferToArrayBuffer(data))
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('File download error:', error)
    return c.json({ error: 'Failed to download file from FilesDB: ' + message, success: false }, 500)
  }
})

// Upload progress endpoint for real-time tracking
app.get('/v1/clipboard/:id/progress', async (c) => {
  const fileId = c.req.param('id')

  try {
    const status = await filesDBClient.getUploadStatus(fileId)

    // Enhanced progress information with timing estimates
    const progressInfo = status.progress || {}
    const fileInfo = status.file_info || {}

    return c.json({
      success: true,
      file_id: status.file_id,
      status: status.status,
      completed: status.completed,
      progress: {
        chunks_uploaded: progressInfo.chunks_uploaded || status.chunks_uploaded_to_blockchain || 0,
        total_chunks: progressInfo.total_chunks || status.total_chunks || 0,
        percentage: progressInfo.percentage || status.progress_percentage || 0,
        remaining_chunks: progressInfo.remaining_chunks || 0,
        elapsed_seconds: progressInfo.elapsed_seconds || 0,
        estimated_remaining_seconds: progressInfo.estimated_remaining_seconds,
        last_chunk_uploaded_at: progressInfo.last_chunk_uploaded_at
      },
      file_info: {
        original_filename: fileInfo.original_filename,
        file_size: fileInfo.file_size,
        content_type: fileInfo.content_type,
        owner: fileInfo.owner
      },
      error: status.error
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Upload progress error:', error)
    return c.json({
      error: 'Failed to get upload progress: ' + message,
      success: false
    }, 500)
  }
})

// Enhanced FilesDB endpoints leveraging v2 upgrades
app.get('/v2/quota', async (c) => {
  try {
    const quota = await enhancedFilesDBClient.checkQuota()
    return c.json({
      quota,
      success: true
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Quota check error:', error)
    return c.json({
      error: 'Failed to check quota: ' + message,
      success: false
    }, 500)
  }
})

app.post('/v2/clipboard/smart-upload', async (c) => {
  try {
    const body = await c.req.json()
    const { kind, content, fileName, fileType, fileData, expiresAt: expiresAtStr, ttlDays } = clipboardSchema.parse(body)

    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
    const userSession = sessionId ? userSessions.get(sessionId) : null

    // Use TTL from request or calculate from expiresAt
    let effectiveTtlDays = ttlDays;
    if (expiresAtStr) {
      const expiresAt = new Date(expiresAtStr).getTime()
      const now = Date.now()
      const calculatedTtl = Math.max(1, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)))
      effectiveTtlDays = ttlDays ? Math.min(ttlDays, calculatedTtl) : calculatedTtl
    }

    const owner = userSession?.id

    let result: { fileId: string; method: string; quotaUsed: any }

    if (kind === 'text') {
      const { fileId, quotaUsed } = await enhancedFilesDBClient.uploadTextWithQuotaCheck(
        content, 'clipboard.txt', effectiveTtlDays, owner
      )
      result = { fileId, method: 'text', quotaUsed }
    } else if (kind === 'file' && fileData) {
      const buffer = Buffer.from(fileData, 'base64')
      const smartResult = await enhancedFilesDBClient.smartUpload(
        buffer, fileName || 'file', fileType || 'application/octet-stream', effectiveTtlDays, owner
      )
      result = smartResult
    } else {
      throw new Error('Invalid clipboard item')
    }

    console.log(`Enhanced upload completed: ${result.fileId}, method: ${result.method}`)

    return c.json({
      id: result.fileId,
      fileId: result.fileId,
      explorerUrl: `https://explorer.kaolin.hoodi.arkiv.network/file/${result.fileId}`,
      success: true,
      method: result.method,
      quota: result.quotaUsed,
      message: 'File uploaded successfully with enhanced FilesDB v2 features'
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Enhanced upload error:', error)
    return c.json({
      error: 'Failed to upload with enhanced features: ' + message,
      success: false
    }, 500)
  }
})

app.get('/v2/session/:sessionKey/status', async (c) => {
  try {
    const sessionKey = c.req.param('sessionKey')
    const status = await enhancedFilesDBClient.getUploadSessionStatus(sessionKey)

    return c.json({
      status,
      success: true
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Session status error:', error)
    return c.json({
      error: 'Failed to get session status: ' + message,
      success: false
    }, 500)
  }
})

app.post('/v2/clipboard/resume-upload', async (c) => {
  try {
    const body = await c.req.json()
    const { sessionKey, fileData, fileName, fileType, ttlDays } = body

    if (!sessionKey || !fileData || !fileName) {
      throw new Error('Missing required fields: sessionKey, fileData, fileName')
    }

    const buffer = Buffer.from(fileData, 'base64')
    const { fileId } = await enhancedFilesDBClient.uploadFileWithResumption(
      buffer, fileName, fileType || 'application/octet-stream', ttlDays || 7, undefined, sessionKey
    )

    return c.json({
      id: fileId,
      fileId,
      sessionKey,
      success: true,
      message: 'Upload resumed successfully'
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('Resume upload error:', error)
    return c.json({
      error: 'Failed to resume upload: ' + message,
      success: false
    }, 500)
  }
})

const port = parseInt(process.env.PORT || '19234')
console.log(`Starting CopyPal backend on port ${port}`)

const _server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch(req: Request, server: Server) {
    // Add server to request context for WebSocket upgrades
    return app.fetch(req, { server })
  },
  idleTimeout: 255, // Max timeout in seconds
  websocket: {
    message(ws: ServerWebSocket<ProgressSocketData>, message: string | Buffer) {
      try {
        const payload = typeof message === 'string' ? message : message.toString()
        const data = JSON.parse(payload)

        if (data.type === 'subscribe' && data.clipboard_id) {
          const clipboardId = data.clipboard_id
          console.log(`WebSocket: Client subscribing to progress for ${clipboardId}`)

          // Add connection to tracking
          if (!progressConnections.has(clipboardId)) {
            progressConnections.set(clipboardId, new Set())
          }
          progressConnections.get(clipboardId)!.add(ws)

          // Store clipboardId on the WebSocket for cleanup
          ws.data = { clipboardId }

          // Send initial status
          ws.send(JSON.stringify({
            type: 'subscribed',
            clipboard_id: clipboardId,
            message: 'Subscribed to progress updates'
          }))

          // Start monitoring if this is the first connection for this clipboard
          if (progressConnections.get(clipboardId)!.size === 1) {
            startProgressMonitoring(clipboardId)
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error)
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format'
        }))
      }
    },

    close(ws: ServerWebSocket<ProgressSocketData>) {
      if (ws.data && ws.data.clipboardId) {
        const clipboardId = ws.data.clipboardId
        console.log(`WebSocket: Client disconnected from ${clipboardId}`)

        const connections = progressConnections.get(clipboardId)
        if (connections) {
          connections.delete(ws)
          if (connections.size === 0) {
            progressConnections.delete(clipboardId)
          }
        }
      }
    }
  }
})

console.log(`Started server: http://0.0.0.0:${port}`)
