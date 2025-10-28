import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLinkIcon, EyeIcon } from "lucide-react"

interface UserFile {
  id: string
  kind: 'text' | 'file'
  content: string
  fileName?: string
  fileType?: string
  fileSize?: number
  createdAt: number
  expiresAt: number
}

interface UserFilesProps {
  sessionId: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export function UserFiles({ sessionId }: UserFilesProps) {
  const [files, setFiles] = useState<UserFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchUserFiles = useCallback(async () => {
    if (!sessionId) {
      console.log('No sessionId available')
      setError('Not logged in')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      console.log('Fetching user files with sessionId:', sessionId.substring(0, 10) + '...')

      const response = await fetch(`${API_BASE}/v1/clipboard/user/items`, {
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      })

      console.log('Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        setFiles(data.items || [])
        setError('')
      } else {
        const errorData = await response.json().catch(() => null)
        console.error('API Error:', response.status, errorData)

        if (response.status === 401) {
          // Session expired or invalid
          console.log('Session expired, forcing logout')
          localStorage.removeItem('sessionId')
          // Force immediate reload to reset auth state
          window.location.reload()
          return
        } else {
          const errorMessage = errorData?.error || `Failed to load files (${response.status})`
          setError(errorMessage)
        }
      }
    } catch (err) {
      console.error('Network error fetching user files:', err)
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (sessionId) {
      fetchUserFiles()
    }
  }, [sessionId, fetchUserFiles])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const handleViewFile = (file: UserFile) => {
    const url = `${window.location.origin}/c/${file.id}`
    window.open(url, '_blank')
  }

  const handleBrowseFile = (file: UserFile) => {
    // Open in Kaolin blockchain explorer with entity
    const kaolinUrl = `https://explorer.kaolin.hoodi.arkiv.network/entity/${file.id}`
    window.open(kaolinUrl, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-[#20C15A] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-[#E85B5B] mb-4">{error}</p>
        <Button onClick={fetchUserFiles} variant="secondary">
          Retry
        </Button>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[#9AA7BD]">No files uploaded yet.</p>
        <p className="text-sm text-[#6B7280] mt-2">Your uploaded files will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#E6EAF2]">Your Files</h3>
        <Button onClick={fetchUserFiles} variant="ghost" size="sm">
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="bg-[#0B0F1A] border border-[#273244] rounded-lg p-4 hover:border-[#20C15A]/30 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    file.kind === 'file'
                      ? 'bg-[#20C15A]/10 text-[#20C15A]'
                      : 'bg-[#3B82F6]/10 text-[#3B82F6]'
                  }`}>
                    {file.kind}
                  </span>
                  {file.fileName && (
                    <span className="text-sm font-medium text-[#E6EAF2] truncate">
                      {file.fileName}
                    </span>
                  )}
                </div>

                {file.kind === 'text' && file.content && (
                  <p className="text-sm text-[#9AA7BD] mb-2 line-clamp-2">
                    {file.content}
                  </p>
                )}

                <div className="flex flex-wrap gap-4 text-xs text-[#6B7280]">
                  <span>Created: {formatDate(file.createdAt)}</span>
                  <span>Expires: {formatDate(file.expiresAt)}</span>
                  {file.fileSize && (
                    <span>Size: {formatFileSize(file.fileSize)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleViewFile(file)}
                  className="h-8 w-8 p-0 hover:bg-[#273244]"
                  title="View file"
                >
                  <EyeIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleBrowseFile(file)}
                  className="h-8 w-8 p-0 hover:bg-[#273244]"
                  title="Open in Kaolin explorer"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
