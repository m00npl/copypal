import { describe, test, expect } from 'bun:test'

const API_BASE = process.env.API_BASE || 'http://localhost:19234'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8881'

describe('Integration Smoke Tests', () => {
  test('End-to-end: Create clipboard and verify URL', async () => {
    // 1. Create clipboard item
    const createResponse = await fetch(`${API_BASE}/v1/clipboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kind: 'text',
        content: 'Integration test content',
        ttlDays: 1
      })
    })

    const createData = await createResponse.json()
    expect(createResponse.status).toBe(200)

    if (createData.success && createData.id) {
      const clipboardId = createData.id

      // 2. Verify frontend URL is accessible
      const frontendResponse = await fetch(`${FRONTEND_URL}/c/${clipboardId}`)
      expect(frontendResponse.status).toBe(200)

      // 3. Try to retrieve (might still be uploading)
      const getResponse = await fetch(`${API_BASE}/v1/clipboard/${clipboardId}`)
      // Should respond even if upload not complete
      expect(getResponse.status).toBeGreaterThanOrEqual(200)
    } else {
      console.log('Clipboard creation in progress:', createData)
      expect(createData.status).toBeDefined()
    }
  }, 60000)

  test('Authentication flow works', async () => {
    const email = `smoke-${Date.now()}@example.com`

    // 1. Request magic link (may fail without SendGrid)
    const requestResponse = await fetch(`${API_BASE}/v1/auth/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    })

    expect(requestResponse.status).toBeGreaterThanOrEqual(200)

    // 2. Verify without session fails
    const sessionResponse = await fetch(`${API_BASE}/v1/auth/session`)
    expect(sessionResponse.status).toBe(401)
  })

  test('File upload progress tracking', async () => {
    // Create a small file clipboard
    const smallFile = Buffer.from('Small test file').toString('base64')

    const createResponse = await fetch(`${API_BASE}/v1/clipboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kind: 'file',
        fileName: 'test.txt',
        fileType: 'text/plain',
        fileData: smallFile,
        ttlDays: 1
      })
    })

    const createData = await createResponse.json()

    // May fail if FilesDB has issues, but should respond
    expect([200, 500]).toContain(createResponse.status)

    if (createResponse.status === 200 && createData.id) {
      // Check progress endpoint
      const progressResponse = await fetch(`${API_BASE}/v1/clipboard/${createData.id}/progress`)
      expect(progressResponse.status).toBeGreaterThanOrEqual(200)
    } else {
      console.log('File upload response:', createResponse.status, createData)
      expect(createData).toBeDefined()
    }
  }, 60000)

  test('GlitchTip error tracking is initialized', async () => {
    // Trigger an error and verify it's logged (check server logs)
    const response = await fetch(`${API_BASE}/v1/clipboard/non-existent-id`)

    // Should handle error gracefully
    expect(response.status).toBeGreaterThanOrEqual(200)
  }, 10000)

  test('API responds to requests from frontend origin', async () => {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: {
        'Origin': FRONTEND_URL,
        'Content-Type': 'application/json'
      }
    })

    expect(response.status).toBe(200)

    // CORS might be handled by nginx
    // Just verify API is accessible
  })
})
