import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Link as LinkIcon, Mail } from "lucide-react"
import { ShareCard } from "@/components/ShareCard"
import { HelpModal } from "@/components/modals/HelpModal"
import { LoginMethodModal } from "@/components/modals/LoginMethodModal"
import { WalletModal } from "@/components/modals/WalletModal"
import { WalletConnectButton } from "@/components/WalletConnectButton"
import { doPow } from "@/lib/pow"

interface User {
  email?: string
  walletAddress?: string
}

interface AuthState {
  user: User | null
  sessionId: string | null
  loading: boolean
}


const API_BASE = import.meta.env.VITE_API_BASE ||
  (import.meta.env.MODE === 'production'
    ? 'https://copypal.online/api'
    : 'http://localhost:19234')

 
export default function App() {
  const [link, setLink] = useState<string | null>(null)
  const [links, setLinks] = useState<string[]>([])

  // Auth state
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    sessionId: localStorage.getItem('sessionId'),
    loading: true
  })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Modal states
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [loginMethodModalOpen, setLoginMethodModalOpen] = useState(false)
  const [walletModalOpen, setWalletModalOpen] = useState(false)

  // Check session on mount
  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    const sessionId = localStorage.getItem('sessionId')
    if (!sessionId) {
      console.log('No sessionId found in localStorage')
      setAuth(prev => ({ ...prev, loading: false }))
      return
    }

    console.log('Checking session validity for:', sessionId.substring(0, 10) + '...')

    try {
      const response = await fetch(`${API_BASE}/v1/auth/session`, {
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Session valid for user:', data.user?.email)
        setAuth({
          user: data.user,
          sessionId,
          loading: false
        })
      } else {
        console.log('Session invalid, status:', response.status)
        localStorage.removeItem('sessionId')
        setAuth({ user: null, sessionId: null, loading: false })
        // Don't show message, just silently logout
      }
    } catch (err) {
      console.error('Session check failed:', err)
      localStorage.removeItem('sessionId')
      setAuth({ user: null, sessionId: null, loading: false })
    }
  }

  const handleCreateLink = async (data: { content?: string; file?: File; expiresAt: Date }): Promise<string | null> => {
    setError('')

    try {
      // Perform Proof of Work
      const pow = await doPow(18) // Difficulty 18 for ~200ms on typical CPU

      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (auth.sessionId) {
        headers['Authorization'] = `Bearer ${auth.sessionId}`
      }

      let payload: any = {
        expiresAt: data.expiresAt.toISOString(),
        pow: {
          nonce: pow.nonce,
          salt: Array.from(pow.salt),
          digest: pow.digest,
          difficulty: pow.difficulty
        }
      }

      if (data.file) {
        // Convert file to base64
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result.split(',')[1]) // Remove data:... prefix
          }
          reader.onerror = reject
          reader.readAsDataURL(data.file!)
        })

        payload = {
          ...payload,
          kind: 'file',
          content: `File: ${data.file.name}`,
          fileName: data.file.name,
          fileType: data.file.type,
          fileSize: data.file.size,
          fileData: fileData
        }
      } else {
        payload = {
          ...payload,
          kind: 'text',
          content: data.content || ''
        }
      }

      const response = await fetch(`${API_BASE}/v1/clipboard`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })

      const responseData = await response.json()

      if (responseData.success) {
        setLink(responseData.url)
        setMessage('Link created successfully!')
        navigator.clipboard?.writeText(responseData.url)

        // Extract clipboard ID from URL for progress tracking
        const clipboardId = responseData.url.split('/').pop()
        if (clipboardId) {
          return clipboardId
        }
      } else {
        setError(responseData.error || 'Failed to create link')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    }

    return null
  }

  const createSingleLink = async (data: { content?: string; file?: File; expiresAt: Date }): Promise<string> => {
    // Perform Proof of Work
    const pow = await doPow(18)

    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (auth.sessionId) {
      headers['Authorization'] = `Bearer ${auth.sessionId}`
    }

    let payload: any = {
      expiresAt: data.expiresAt.toISOString(),
      pow: {
        nonce: pow.nonce,
        salt: Array.from(pow.salt),
        digest: pow.digest,
        difficulty: pow.difficulty
      }
    }

    if (data.file) {
      // Convert file to base64
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1]) // Remove data:... prefix
        }
        reader.onerror = reject
        reader.readAsDataURL(data.file!)
      })

      payload = {
        ...payload,
        kind: 'file',
        content: `File: ${data.file.name}`,
        fileName: data.file.name,
        fileType: data.file.type,
        fileSize: data.file.size,
        fileData: fileData
      }
    } else {
      payload = {
        ...payload,
        kind: 'text',
        content: data.content || ''
      }
    }

    const response = await fetch(`${API_BASE}/v1/clipboard`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    const responseData = await response.json()

    if (responseData.success) {
      return responseData.url
    } else {
      throw new Error(responseData.error || 'Failed to create link')
    }
  }

  const handleCreateMultipleLinks = async (data: { files: File[]; expiresAt: Date }): Promise<string[]> => {
    setError('')
    setMessage('')
    setLinks([])

    const createdLinks: string[] = []

    try {
      for (let i = 0; i < data.files.length; i++) {
        const file = data.files[i]

        try {
          const url = await createSingleLink({ file, expiresAt: data.expiresAt })
          createdLinks.push(url)

          // Update progress
          setMessage(`Creating links... ${i + 1}/${data.files.length}`)

          // Wait a bit to avoid overwhelming the server
          if (i < data.files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        } catch (err) {
          console.error(`Failed to create link for ${file.name}:`, err)
          // Continue with other files
        }
      }

      if (createdLinks.length > 0) {
        setLinks(createdLinks)
        setMessage(`Created ${createdLinks.length} links successfully!`)

        // Copy all links to clipboard (each on new line)
        const allLinks = createdLinks.join('\n')
        navigator.clipboard?.writeText(allLinks)
      } else {
        setError('Failed to create any links.')
      }

      return createdLinks
    } catch (err) {
      setError('Failed to create links. Please try again.')
      return []
    }
  }

  const requestMagicLink = async () => {
    if (!email) {
      setError('Please enter your email')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/v1/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (data.success) {
        setShowEmailModal(false)
        setShowCodeInput(true)
        setMessage('Magic link code sent to your email!')
        setError('')
      } else {
        setError(data.error || 'Failed to send magic link')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    }
  }

  const verifyCode = async () => {
    if (!code) {
      setError('Please enter the 6-digit code')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/v1/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      })

      const data = await response.json()

      if (data.success) {
        localStorage.setItem('sessionId', data.sessionId)
        setAuth({
          user: data.user,
          sessionId: data.sessionId,
          loading: false
        })
        setShowCodeInput(false)
        setMessage('Successfully signed in!')
        setError('')
        setEmail('')
        setCode('')
      } else {
        setError(data.error || 'Invalid code')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    }
  }

  const handleWalletConnect = async (address: string) => {
    try {
      console.log('Starting wallet authentication for:', address)
      setError('')
      setMessage('')

      // Create a message to sign for authentication
      const message = `Sign this message to authenticate with CopyPal.\nWallet: ${address}\nTimestamp: ${Date.now()}`

      // For now, we'll skip actual signature verification and just send the address
      // In production, you'd get a signature from the wallet
      const signature = 'dummy_signature'

      console.log('Sending wallet auth request to:', `${API_BASE}/v1/auth/wallet`)
      const response = await fetch(`${API_BASE}/v1/auth/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          walletAddress: address,
          signature,
          message
        })
      })

      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)

      if (data.success) {
        localStorage.setItem('sessionId', data.sessionId)
        setAuth({
          user: data.user,
          sessionId: data.sessionId,
          loading: false
        })
        setMessage(`Connected with wallet ${address.slice(0, 6)}...${address.slice(-4)}`)
      } else {
        console.error('Wallet auth failed:', data.error)
        setError(data.error || 'Wallet authentication failed')
      }
    } catch (err) {
      console.error('Wallet auth error:', err)
      setError('Failed to authenticate with wallet: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleWalletDisconnect = () => {
    localStorage.removeItem('sessionId')
    setAuth({ user: null, sessionId: null, loading: false })
    setMessage('Wallet disconnected')
  }

  const logout = async () => {
    if (auth.sessionId) {
      await fetch(`${API_BASE}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.sessionId}`
        }
      })
    }

    localStorage.removeItem('sessionId')
    setAuth({ user: null, sessionId: null, loading: false })
    setMessage('Logged out successfully')
  }

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] text-[#E6EAF2] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#20C15A] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#E6EAF2] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#273244] bg-[#0B0F1A]/60 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <LinkIcon className="w-5 h-5 text-[#20C15A]" />
          CopyPal
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHelpModalOpen(true)}
            className="text-[#9AA7BD] hover:text-[#E6EAF2] hover:bg-[#273244]"
          >
            Help
          </Button>
          {!auth.user ? (
            <>
              <WalletConnectButton
                onConnect={() => setWalletModalOpen(true)}
                onDisconnect={handleWalletDisconnect}
              />
              <Button
                className="flex items-center gap-2 bg-[#20C15A] hover:bg-[#1ca549]"
                onClick={() => {
                  setShowCodeInput(false)
                  setEmail('')
                  setCode('')
                  setError('')
                  setMessage('')
                  setShowEmailModal(true)
                }}
              >
                <Mail className="w-4 h-4" />
                Sign in with email
              </Button>
              <button
                className="text-sm text-[#9AA7BD] hover:text-[#E6EAF2] transition-colors"
                onClick={() => setLoginMethodModalOpen(true)}
              >
                Which login should I choose?
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#9AA7BD]">
                {auth.user.email
                  ? `Signed in as ${auth.user.email}`
                  : `Connected: ${auth.user.walletAddress?.slice(0, 6)}...${auth.user.walletAddress?.slice(-4)}`
                }
              </span>
              {auth.user.walletAddress ? (
                <WalletConnectButton
                  onConnect={() => setWalletModalOpen(true)}
                  onDisconnect={handleWalletDisconnect}
                />
              ) : (
                <Button
                  variant="secondary"
                  onClick={logout}
                  className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                >
                  Logout
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Email Input Modal */}
      {showEmailModal && !auth.user && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 bg-[#131A26] border-[#273244]">
            <CardHeader>
              <h2 className="text-xl font-semibold text-[#E6EAF2]">Sign in with email</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && requestMagicLink()}
                className="bg-[#0B0F1A] border-[#273244] text-[#E6EAF2]"
              />
              {error && (
                <p className="text-sm text-[#E85B5B]">{error}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={requestMagicLink} className="flex-1 bg-[#20C15A] hover:bg-[#1ca549]">
                  Send Magic Link
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowEmailModal(false)}
                  className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Code Input Modal */}
      {showCodeInput && !auth.user && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 bg-[#131A26] border-[#273244]">
            <CardHeader>
              <h2 className="text-xl font-semibold text-[#E6EAF2]">Enter verification code</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[#9AA7BD]">
                Enter the 6-digit code sent to {email}
              </p>
              <Input
                type="text"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && verifyCode()}
                maxLength={6}
                className="bg-[#0B0F1A] border-[#273244] text-[#E6EAF2]"
              />
              {error && (
                <p className="text-sm text-[#E85B5B]">{error}</p>
              )}
              {message && (
                <p className="text-sm text-[#20C15A]">{message}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={verifyCode} className="flex-1 bg-[#20C15A] hover:bg-[#1ca549]">
                  Verify Code
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCodeInput(false)
                    setShowEmailModal(true)
                  }}
                  className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                >
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 px-6 py-10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left Column - Hero and Features (hidden on mobile) */}
          <section className="hidden lg:flex flex-col justify-center space-y-6">
            <div>
              <h1 className="text-4xl font-semibold mb-3">Share clips in two clicks.</h1>
              <p className="text-xl text-[#9AA7BD] max-w-prose">
                A temporary, cross-device clipboard backed by DB-Chain. Create short-lived links for text or files in seconds.
              </p>
            </div>

            <ul className="space-y-2 text-[#E6EAF2]">
              <li>• Upload files or paste text with mobile-first controls.</li>
              <li>• Choose an expiration preset or custom date.</li>
              <li>• Built-in Proof of Work keeps spam at bay.</li>
            </ul>
          </section>

          {/* Right Column - Form */}
          <section className="flex flex-col justify-center">
            {/* Mobile Hero */}
            <div className="lg:hidden text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">CopyPal</h1>
              <p className="text-[#9AA7BD]">A temporary, cross-device clipboard backed by DB-Chain</p>
            </div>

            {/* Messages */}
            {message && (
              <div className="mb-4 p-3 rounded-lg bg-[#20C15A]/10 border border-[#20C15A]/20 text-[#20C15A]">
                {message}
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-[#E85B5B]/10 border border-[#E85B5B]/20 text-[#E85B5B]">
                {error}
              </div>
            )}

            <ShareCard onCreateLink={handleCreateLink} onCreateMultipleLinks={handleCreateMultipleLinks} sessionId={auth.sessionId} />


            {/* Result Link */}
            {link && (
              <div className="mt-6 bg-[#131A26]/50 backdrop-blur-sm border border-[#273244] rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 text-[#E6EAF2]">Your link is ready</h3>
                <div className="flex gap-2">
                  <Input
                    value={link}
                    readOnly
                    className="flex-1 bg-[#0B0F1A] border-[#273244] text-[#E6EAF2]"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard?.writeText(link)
                      setMessage('Link copied ✅')
                    }}
                    className="bg-[#20C15A] hover:bg-[#1ca549]"
                  >
                    Copy
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => window.open(link, '_blank')}
                    className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                  >
                    Open
                  </Button>
                </div>
              </div>
            )}

            {/* Multiple Result Links */}
            {links.length > 0 && (
              <div className="mt-6 bg-[#131A26]/50 backdrop-blur-sm border border-[#273244] rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 text-[#E6EAF2]">Your links are ready ({links.length})</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {links.map((linkUrl, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={linkUrl}
                        readOnly
                        className="flex-1 bg-[#0B0F1A] border-[#273244] text-[#E6EAF2]"
                      />
                      <Button
                        onClick={() => {
                          navigator.clipboard?.writeText(linkUrl)
                          setMessage(`Link ${index + 1} copied ✅`)
                        }}
                        className="bg-[#20C15A] hover:bg-[#1ca549]"
                      >
                        Copy
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => window.open(linkUrl, '_blank')}
                        className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                      >
                        Open
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-[#273244]">
                  <Button
                    onClick={() => {
                      const allLinks = links.join('\n')
                      navigator.clipboard?.writeText(allLinks)
                      setMessage('All links copied ✅')
                    }}
                    variant="secondary"
                    className="w-full bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                  >
                    Copy All Links
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-xs text-[#9AA7BD] px-4 py-3 border-t border-[#273244] text-center">
        <span className="inline-flex items-center gap-1">
          ⚡ Free tier: 50 clips/day, 10 requests/hour
        </span>
        {' · '}
        <a href="#" className="underline hover:text-[#20C15A] transition-colors">
          Learn more
        </a>
      </footer>

      {/* Modals */}
      <HelpModal open={helpModalOpen} onOpenChange={setHelpModalOpen} />
      <LoginMethodModal
        open={loginMethodModalOpen}
        onOpenChange={setLoginMethodModalOpen}
        onEmailClick={() => {
          setLoginMethodModalOpen(false)
          setShowEmailModal(true)
        }}
        onWalletClick={() => {
          setLoginMethodModalOpen(false)
          setWalletModalOpen(true)
        }}
      />

      <WalletModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        onConnect={handleWalletConnect}
      />
    </div>
  )
}