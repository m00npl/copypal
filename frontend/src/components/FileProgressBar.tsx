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

interface FileProgressBarProps {
  clipboardId: string | null
  isUploading: boolean
  onComplete?: () => void
}

const API_BASE = import.meta.env.MODE === 'production'
  ? 'https://copypal.online/api'
  : 'http://localhost:19234'

export function FileProgressBar({ clipboardId, isUploading, onComplete }: FileProgressBarProps) {
  const [userProgress, setUserProgress] = useState(0)
  const [arkivProgress, setArkivProgress] = useState<FileDBProgress | null>(null)

  // Update user progress based on upload state
  useEffect(() => {
    if (isUploading) {
      setUserProgress(50)
      return () => {}
    }

    if (!clipboardId) {
      setUserProgress(0)
      setArkivProgress(null)
      return () => {}
    }

    setUserProgress(100)

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
  }, [clipboardId, isUploading, onComplete])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Don't show anything if not uploading and no clipboard ID
  if (!isUploading && !clipboardId) return null

  return (
    <div className="mt-3 space-y-2">
      {/* First Progress Bar: User → CopyPal */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-[#9AA7BD]">User → CopyPal</span>
          <span className={`${userProgress === 100 ? 'text-[#20C15A]' : 'text-[#9AA7BD]'}`}>
            {userProgress === 100 ? '✓ Complete' : `${userProgress}%`}
          </span>
        </div>
        <div className="w-full bg-[#273244] rounded-full h-2">
          <div
            className="bg-[#20C15A] h-2 rounded-full transition-all duration-300"
            style={{ width: `${userProgress}%` }}
          />
        </div>
      </div>

      {/* Second Progress Bar: CopyPal → Arkiv */}
      {clipboardId && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
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
          {arkivProgress && arkivProgress.progress.total_chunks > 0 && (
            <div className="flex justify-between text-xs text-[#9AA7BD]">
              <span>Chunks: {arkivProgress.progress.chunks_uploaded}/{arkivProgress.progress.total_chunks}</span>
              {arkivProgress.progress.elapsed_seconds > 0 && (
                <span>
                  {arkivProgress.progress.estimated_remaining_seconds
                    ? `~${formatTime(arkivProgress.progress.estimated_remaining_seconds)} left`
                    : `${formatTime(arkivProgress.progress.elapsed_seconds)} elapsed`
                  }
                </span>
              )}
            </div>
          )}

          {arkivProgress?.error && (
            <div className="text-xs text-[#E85B5B]">
              Error: {arkivProgress.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
