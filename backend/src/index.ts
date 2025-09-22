import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import sgMail from '@sendgrid/mail'

const app = new Hono()

// Configure SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@copypal.online'

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
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
  email: string
  createdAt: number
}

interface ClipboardItem {
  id: string
  content: string
  userId?: string
  createdAt: number
  expiresAt: number
}

const authSessions = new Map<string, AuthSession>()
const userSessions = new Map<string, UserSession>()
const clipboardItems = new Map<string, ClipboardItem>()

// Validation schemas
const requestMagicLinkSchema = z.object({
  email: z.string().email()
})

const verifyMagicLinkSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6)
})

const clipboardSchema = z.object({
  content: z.string().min(1).max(10000)
})

// Health endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() })
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

  return c.json({
    success: true,
    user: { email: userSession.email }
  })
})

app.post('/v1/auth/logout', async (c) => {
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
  if (sessionId) {
    userSessions.delete(sessionId)
  }

  return c.json({ success: true })
})

// Clipboard endpoints
app.post('/v1/clipboard', async (c) => {
  try {
    const body = await c.req.json()
    const { content } = clipboardSchema.parse(body)

    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
    const userSession = sessionId ? userSessions.get(sessionId) : null

    // Generate unique ID
    const id = nanoid()
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000) // 24 hours

    const item: ClipboardItem = {
      id,
      content,
      userId: userSession?.id,
      createdAt: Date.now(),
      expiresAt
    }

    clipboardItems.set(id, item)

    return c.json({
      success: true,
      id,
      url: `${process.env.BASE_URL || 'http://localhost:19234'}/v1/clipboard/${id}`
    })
  } catch (error) {
    console.error('Clipboard create error:', error)
    return c.json({
      error: 'Invalid request',
      success: false
    }, 400)
  }
})

app.get('/v1/clipboard/:id', async (c) => {
  const id = c.req.param('id')
  const item = clipboardItems.get(id)

  if (!item) {
    return c.json({ error: 'Item not found', success: false }, 404)
  }

  if (Date.now() > item.expiresAt) {
    clipboardItems.delete(id)
    return c.json({ error: 'Item expired', success: false }, 410)
  }

  return c.json({
    success: true,
    content: item.content,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt
  })
})

const port = parseInt(process.env.PORT || '19234')
console.log(`Starting CopyPal backend on port ${port}`)

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
})

console.log(`Started server: http://0.0.0.0:${port}`)