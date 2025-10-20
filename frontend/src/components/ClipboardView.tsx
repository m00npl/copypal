import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Copy, ArrowLeft, Clock, AlertCircle, Download, Image, File } from "lucide-react"
import { format } from "date-fns"

const API_BASE = import.meta.env.VITE_API_BASE ||
  (import.meta.env.MODE === 'production'
    ? 'https://copypal.online/api'
    : 'http://localhost:19234')

interface ClipboardItem {
  success: boolean
  kind: 'text' | 'file'
  content: string
  fileName?: string
  fileType?: string
  fileSize?: number
  fileData?: string
  createdAt: number
  expiresAt: number
  error?: string
}

export function ClipboardView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<ClipboardItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) {
      setError('Invalid clipboard ID')
      setLoading(false)
      return
    }

    fetchItem()
  }, [id])

  const fetchItem = async () => {
    try {
      const response = await fetch(`${API_BASE}/v1/clipboard/${id}`)
      const data = await response.json()

      if (data.success) {
        setItem(data)
      } else {
        setError(data.error || 'Failed to load clipboard item')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!item?.content) return

    try {
      await navigator.clipboard.writeText(item.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const timeRemaining = item ? item.expiresAt - Date.now() : 0
  const isExpired = timeRemaining <= 0
  const expiresDate = item ? new Date(item.expiresAt) : null

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const downloadFile = () => {
    if (!item?.fileName || !item?.fileData) return

    try {
      // Create download URL
      const downloadUrl = `${API_BASE}/v1/clipboard/${id}/download`

      // Create temporary link and trigger download
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = item.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const getImageDataUrl = () => {
    if (item?.kind === 'file' && item.fileData && item.fileType?.startsWith('image/')) {
      return `data:${item.fileType};base64,${item.fileData}`
    }
    return null
  }

  const isImage = item?.kind === 'file' && item.fileType?.startsWith('image/')

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] text-[#E6EAF2] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#20C15A] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading clipboard item...</p>
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] text-[#E6EAF2] flex items-center justify-center px-4">
        <Card className="w-full max-w-md bg-[#131A26] border-[#273244]">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#E85B5B]/10 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-[#E85B5B]" />
            </div>
            <h1 className="text-xl font-semibold text-[#E6EAF2]">
              {error === 'Item not found' ? 'Clipboard Not Found' :
               error === 'Item expired' ? 'Clipboard Expired' : 'Error'}
            </h1>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-[#9AA7BD]">
              {error === 'Item not found'
                ? 'This clipboard item doesn\'t exist or has been deleted.'
                : error === 'Item expired'
                ? 'This clipboard item has expired and is no longer available.'
                : error || 'Something went wrong while loading this clipboard item.'}
            </p>
            <Button
              onClick={() => navigate('/')}
              className="w-full bg-[#20C15A] hover:bg-[#1ca549]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back to CopyPal
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-[#E6EAF2]">
      {/* Header */}
      <header className="border-b border-[#273244] bg-[#0B0F1A]/60 backdrop-blur px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-[#9AA7BD] hover:text-[#E6EAF2] hover:bg-[#273244]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to CopyPal
            </Button>
          </div>
          <div className="text-lg font-semibold">Clipboard View</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Status Card */}
          <Card className="bg-[#131A26] border-[#273244]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#20C15A]" />
                  <div>
                    <div className="font-medium text-[#E6EAF2]">
                      {isExpired ? 'Expired' : 'Active'}
                    </div>
                    <div className="text-sm text-[#9AA7BD]">
                      {expiresDate && (
                        isExpired
                          ? `Expired on ${format(expiresDate, 'PPP \'at\' p')}`
                          : `Expires on ${format(expiresDate, 'PPP \'at\' p')}`
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-[#9AA7BD]">
                  Created {format(new Date(item.createdAt), 'PPP \'at\' p')}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Card */}
          <Card className="bg-[#131A26] border-[#273244]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {item.kind === 'file' ? (
                    isImage ? <Image className="w-5 h-5 text-[#20C15A]" /> : <File className="w-5 h-5 text-[#20C15A]" />
                  ) : (
                    <Copy className="w-5 h-5 text-[#20C15A]" />
                  )}
                  <h2 className="text-lg font-semibold text-[#E6EAF2]">
                    {item.kind === 'file' ? item.fileName || 'File' : 'Text Content'}
                  </h2>
                  {item.kind === 'file' && item.fileSize && (
                    <span className="text-sm text-[#9AA7BD]">({formatFileSize(item.fileSize)})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.kind === 'file' ? (
                    <Button
                      onClick={downloadFile}
                      disabled={isExpired}
                      className="bg-[#20C15A] hover:bg-[#1ca549] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  ) : (
                    <Button
                      onClick={copyToClipboard}
                      disabled={isExpired}
                      className="bg-[#20C15A] hover:bg-[#1ca549] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isExpired ? (
                  <div className="flex items-center justify-center min-h-[200px]">
                    <div className="bg-[#131A26]/90 border border-[#273244] rounded-xl px-6 py-3">
                      <div className="text-[#E85B5B] font-medium">Content Expired</div>
                      <div className="text-sm text-[#9AA7BD]">This clipboard item is no longer available</div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {item.kind === 'file' ? (
                      <div>
                        {isImage ? (
                          <div className="max-h-[500px] overflow-hidden rounded-xl border border-[#273244]">
                            <img
                              src={getImageDataUrl()!}
                              alt={item.fileName}
                              className="max-w-full h-auto mx-auto"
                            />
                          </div>
                        ) : (
                          <div className="bg-[#0B0F1A] border border-[#273244] rounded-xl p-6 text-center">
                            <File className="w-16 h-16 mx-auto mb-4 text-[#9AA7BD]" />
                            <div className="text-[#E6EAF2] font-medium mb-2">{item.fileName}</div>
                            <div className="text-sm text-[#9AA7BD] mb-4">
                              {item.fileType} • {item.fileSize && formatFileSize(item.fileSize)}
                            </div>
                            <Button
                              onClick={downloadFile}
                              className="bg-[#20C15A] hover:bg-[#1ca549]"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download File
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea
                        value={item.content}
                        readOnly
                        className="w-full min-h-[200px] p-4 bg-[#0B0F1A] border border-[#273244] rounded-xl text-[#E6EAF2] font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#20C15A]/20 focus:border-[#20C15A]"
                      />
                    )}
                  </div>
                )}

                {!isExpired && (
                  <div className="flex gap-2">
                    <Input
                      value={`https://copypal.online/c/${id}`}
                      readOnly
                      className="flex-1 bg-[#0B0F1A] border-[#273244] text-[#E6EAF2] font-mono text-sm"
                    />
                    <Button
                      onClick={() => {
                        navigator.clipboard?.writeText(`https://copypal.online/c/${id}`)
                      }}
                      variant="secondary"
                      className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
                    >
                      Copy Link
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}