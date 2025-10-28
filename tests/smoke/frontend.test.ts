import { describe, test, expect } from 'bun:test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8881'

describe('Frontend Smoke Tests', () => {
  test('Frontend index page loads', async () => {
    const response = await fetch(FRONTEND_URL)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  test('Frontend serves static assets', async () => {
    const response = await fetch(FRONTEND_URL)
    const html = await response.text()

    // Check if HTML contains expected elements
    expect(html).toContain('<div id="root">')
    expect(html).toContain('<!doctype html>')
    expect(html.toLowerCase()).toContain('clipboard')
  })

  test('Frontend manifest.json is accessible', async () => {
    const response = await fetch(`${FRONTEND_URL}/manifest.json`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const manifest = await response.json()
    expect(manifest.name).toBeDefined()
  })

  test('Frontend service worker is accessible', async () => {
    const response = await fetch(`${FRONTEND_URL}/sw.js`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('javascript')
  }, 10000)

  test('Frontend icons are accessible', async () => {
    const iconSizes = ['48', '72', '96', '144', '192', '256', '384', '512']

    for (const size of iconSizes) {
      const response = await fetch(`${FRONTEND_URL}/icon-${size}.png`)
      expect(response.status).toBe(200)
    }
  }, 15000)

  test('Frontend handles SPA routing (404 fallback)', async () => {
    // Should return index.html for any route
    const response = await fetch(`${FRONTEND_URL}/c/test-id`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })
})
