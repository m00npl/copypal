import { useState, useEffect } from "react"

interface FileDBProgress {
  file_id: string
  status: 'uploading' | 'completed' | 'failed'
  completed: boolean
  progress: {
    chunks_uploaded: number
    total_chunks: number
    percentage: number
    remaining_chunks: number
    elapsed_seconds: number
    estimated_remaining_seconds: number | null
    last_chunk_uploaded_at: string | null
  }
  error: string | null
  file_info: {
    original_filename: string
    file_size: number
    content_type: string
    owner?: string
  }
}

interface DualProgressBarProps {
  clipboardId: string | null
  onComplete?: () => void
}

const API_BASE = import.meta.env.MODE === 'production'
  ? 'https://copypal.online/api'
  : 'http://localhost:19234'

export function DualProgressBar({ clipboardId, onComplete }: DualProgressBarProps) {
  const [arkivProgress, setArkivProgress] = useState<FileDBProgress | null>(null)

  useEffect(() => {
    if (!clipboardId) {
      setArkivProgress(null)
      return
    }

    let isActive = true
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      if (!isActive) return

      try {
        const response = await fetch(`${API_BASE}/v1/clipboard/${clipboardId}/progress`)
        if (response.ok) {
          const progress: FileDBProgress = await response.json()
          setArkivProgress(progress)

          if (progress.completed || progress.status === 'failed') {
            isActive = false
            onComplete?.()
            return
          }
        }
      } catch (error) {
        console.error('Progress polling error:', error)
      }

      if (!isActive) return
      timeoutId = setTimeout(poll, 2000)
    }

    poll()

    return () => {
      isActive = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [clipboardId, onComplete])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!clipboardId) return null

  return (
    <div className="space-y-4 p-4 bg-[#0B0F1A] border border-[#273244] rounded-lg">
      <div className="text-sm font-medium text-[#E6EAF2]">Upload Progress</div>

      {/* First Progress Bar: User → CopyPal */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[#9AA7BD]">User → CopyPal</span>
          <span className="text-[#20C15A]">✓ Complete</span>
        </div>
        <div className="w-full bg-[#273244] rounded-full h-2">
          <div
            className="bg-[#20C15A] h-2 rounded-full transition-all duration-300"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Second Progress Bar: CopyPal → Arkiv */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[#9AA7BD]">CopyPal → Arkiv</span>
          <span className={`${
            arkivProgress?.completed
              ? 'text-[#20C15A]'
              : arkivProgress?.status === 'failed'
                ? 'text-[#E85B5B]'
                : 'text-[#9AA7BD]'
          }`}>
            {arkivProgress?.completed
              ? '✓ Complete'
              : arkivProgress?.status === 'failed'
                ? '✗ Failed'
                : arkivProgress?.progress.percentage
                  ? `${arkivProgress.progress.percentage}%`
                  : 'Starting...'
            }
          </span>
        </div>

        <div className="w-full bg-[#273244] rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              arkivProgress?.status === 'failed'
                ? 'bg-[#E85B5B]'
                : 'bg-[#20C15A]'
            }`}
            style={{ width: `${arkivProgress?.progress.percentage || 0}%` }}
          />
        </div>

        {/* Detailed Progress Info */}
        {arkivProgress && (
          <div className="space-y-1 text-xs text-[#9AA7BD]">
            {arkivProgress.file_info && (
              <div className="flex justify-between">
                <span>{arkivProgress.file_info.original_filename}</span>
                <span>{formatFileSize(arkivProgress.file_info.file_size)}</span>
              </div>
            )}

            {arkivProgress.progress.total_chunks > 0 && (
              <div className="flex justify-between">
                <span>Chunks: {arkivProgress.progress.chunks_uploaded}/{arkivProgress.progress.total_chunks}</span>
                {arkivProgress.progress.elapsed_seconds > 0 && (
                  <span>Elapsed: {formatTime(arkivProgress.progress.elapsed_seconds)}</span>
                )}
              </div>
            )}

            {arkivProgress.progress.estimated_remaining_seconds && (
              <div className="text-center text-[#9AA7BD]">
                Estimated time remaining: ~{formatTime(arkivProgress.progress.estimated_remaining_seconds)}
              </div>
            )}

            {arkivProgress.error && (
              <div className="text-[#E85B5B] mt-2">
                Error: {arkivProgress.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
