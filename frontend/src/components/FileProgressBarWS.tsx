import { useState, useEffect, useRef, useCallback } from "react"

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

interface FileProgressBarWSProps {
  clipboardId: string | null
  isUploading: boolean
  onComplete?: () => void
}

const WS_BASE = import.meta.env.MODE === 'production'
  ? 'wss://copypal.online/ws'
  : 'ws://localhost:19234/ws'

export function FileProgressBarWS({ clipboardId, isUploading, onComplete }: FileProgressBarWSProps) {
  const [userProgress, setUserProgress] = useState(0)
  const [arkivProgress, setArkivProgress] = useState<FileDBProgress | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRef = useRef<FileDBProgress | null>(null)

  useEffect(() => {
    progressRef.current = arkivProgress
  }, [arkivProgress])

  // Update user progress based on upload state
  const connectWebSocket = useCallback(() => {
    if (!clipboardId || wsRef.current?.readyState === WebSocket.OPEN) return

    console.log(`Connecting to WebSocket for progress updates: ${clipboardId}`)
    setConnectionStatus('connecting')

    const ws = new WebSocket(`${WS_BASE}/progress`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log(`WebSocket connected for ${clipboardId}`)
      setConnectionStatus('connected')

      ws.send(JSON.stringify({
        type: 'subscribe',
        clipboard_id: clipboardId
      }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('WebSocket progress update:', data)

        if (data.type === 'progress') {
      setArkivProgress(data)
          progressRef.current = data

          if (data.completed || data.status === 'failed') {
            onComplete?.()
            setTimeout(() => ws.close(), 2000)
          }
        } else if (data.type === 'subscribed') {
          console.log(`Subscribed to progress for ${clipboardId}`)
        } else if (data.type === 'error') {
          console.error('WebSocket progress error:', data.error)
          setArkivProgress(prev => (prev ? { ...prev, error: data.error } : null))
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    ws.onclose = (event) => {
      console.log(`WebSocket closed for ${clipboardId}`, event.code, event.reason)
      setConnectionStatus('disconnected')

      const latestProgress = progressRef.current
      const shouldReconnect = event.code !== 1000 && latestProgress?.completed !== true && latestProgress?.status !== 'failed'

      if (shouldReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null
          connectWebSocket()
        }, 3000)
      }
    }

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${clipboardId}:`, error)
      setConnectionStatus('error')
    }
  }, [clipboardId, onComplete])

  useEffect(() => {
    if (isUploading) {
      setUserProgress(50)
      return () => {}
    }

    if (!clipboardId) {
      setUserProgress(0)
      setArkivProgress(null)
      setConnectionStatus('disconnected')
      return () => {}
    }

    setUserProgress(100)
    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [isUploading, clipboardId, connectWebSocket])

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
            <span className="text-[#9AA7BD]">
              CopyPal → Arkiv
              {connectionStatus === 'connected' && <span className="text-[#20C15A]"> ●</span>}
              {connectionStatus === 'connecting' && <span className="text-yellow-500"> ●</span>}
              {connectionStatus === 'error' && <span className="text-[#E85B5B]"> ●</span>}
            </span>
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
                  : arkivProgress?.progress?.percentage
                    ? `${arkivProgress.progress.percentage}%`
                    : connectionStatus === 'connected'
                      ? 'Starting...'
                      : connectionStatus === 'connecting'
                        ? 'Connecting...'
                        : 'Waiting...'
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
              style={{ width: `${arkivProgress?.progress?.percentage || 0}%` }}
            />
          </div>

          {/* Detailed Progress Info */}
          {arkivProgress && arkivProgress.progress?.total_chunks > 0 && (
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

          {connectionStatus === 'error' && (
            <div className="text-xs text-[#E85B5B]">
              Connection lost, attempting to reconnect...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
