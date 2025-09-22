import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ExpirationPicker } from "./ExpirationPicker"
import { Upload, Trash2, Eye, Link as LinkIcon } from "lucide-react"
import { FilePreviewModal } from "./modals/FilePreviewModal"

interface FileFormProps {
  onCreateLink: (data: { file: File; expiresAt: Date }) => Promise<void>
}

interface FileWithProgress {
  file: File
  progress: number
}

export function FileForm({ onCreateLink }: FileFormProps) {
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const [preset, setPreset] = useState<'15m' | '1h' | '1d' | '7d' | 'custom'>('1h')
  const [customDate, setCustomDate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const maxFileSize = 64 * 1024 * 1024 // 64MB

  const getExpiresAt = () => {
    if (preset === 'custom' && customDate) {
      return customDate
    }

    const now = new Date()
    const map: Record<string, number> = {
      '15m': 15,
      '1h': 60,
      '1d': 1440,
      '7d': 10080
    }

    const minutes = map[preset] || 60
    return new Date(now.getTime() + (minutes * 60 * 1000))
  }

  const handleFiles = useCallback((fileList: FileList) => {
    const newFiles = Array.from(fileList).filter(file => {
      if (file.size > maxFileSize) {
        alert(`File "${file.name}" is too large. Maximum size is 64MB.`)
        return false
      }
      return true
    })

    const filesWithProgress = newFiles.map(file => ({ file, progress: 100 }))
    setFiles(prev => [...prev, ...filesWithProgress])
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const canPreview = (file: File) => {
    return file.type.startsWith('text/') ||
           file.type.startsWith('image/') ||
           file.type === 'application/json' ||
           file.name.endsWith('.py') ||
           file.name.endsWith('.js') ||
           file.name.endsWith('.ts') ||
           file.name.endsWith('.tsx') ||
           file.name.endsWith('.jsx')
  }

  const handleCreateLink = async () => {
    if (files.length === 0) return

    setIsLoading(true)
    try {
      // For now, we'll just use the first file
      await onCreateLink({
        file: files[0].file,
        expiresAt: getExpiresAt()
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {files.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-[#20C15A] bg-[#20C15A]/5'
                : 'border-[#273244] hover:border-[#20C15A]/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-[#20C15A]" />
            <p className="text-[#E6EAF2] mb-1">Drop a file here or tap to upload</p>
            <p className="text-sm text-[#9AA7BD]">Maximum file size: 64MB</p>
            <input
              id="file-input"
              type="file"
              className="hidden"
              onChange={handleFileInput}
              multiple
            />
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((fileWithProgress, index) => (
              <div key={index} className="bg-[#0B0F1A] border border-[#273244] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#E6EAF2] truncate">
                      {fileWithProgress.file.name}
                    </p>
                    <p className="text-sm text-[#9AA7BD]">
                      {formatFileSize(fileWithProgress.file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {canPreview(fileWithProgress.file) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewFile(fileWithProgress.file)}
                        className="text-[#9AA7BD] hover:text-[#E6EAF2] hover:bg-[#273244]"
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="text-[#E85B5B] hover:text-[#E85B5B] hover:bg-[#E85B5B]/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 w-full bg-[#273244] rounded-full h-2">
                  <div
                    className="bg-[#20C15A] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${fileWithProgress.progress}%` }}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="ghost"
              onClick={() => document.getElementById('file-input')?.click()}
              className="w-full border-2 border-dashed border-[#273244] hover:border-[#20C15A]/50 text-[#9AA7BD] hover:text-[#E6EAF2]"
            >
              <Upload className="w-4 h-4 mr-2" />
              Add more files
            </Button>
            <input
              id="file-input"
              type="file"
              className="hidden"
              onChange={handleFileInput}
              multiple
            />
          </div>
        )}

        <ExpirationPicker
          preset={preset}
          onPresetChange={setPreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />

        <Button
          className="w-full bg-[#20C15A] hover:bg-[#1ca549] text-white"
          disabled={files.length === 0 || isLoading}
          onClick={handleCreateLink}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Creating...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Create file link
            </div>
          )}
        </Button>
      </div>

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          open={!!previewFile}
          onOpenChange={() => setPreviewFile(null)}
        />
      )}
    </>
  )
}