import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface FilePreviewModalProps {
  file: File
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FilePreviewModal({ file, open, onOpenChange }: FilePreviewModalProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!open || !file) return

    setLoading(true)
    setError('')

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setContent(url)
      setLoading(false)
      return () => URL.revokeObjectURL(url)
    }

    if (file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        file.name.endsWith('.py') ||
        file.name.endsWith('.js') ||
        file.name.endsWith('.ts') ||
        file.name.endsWith('.tsx') ||
        file.name.endsWith('.jsx')) {

      const reader = new FileReader()
      reader.onload = (e) => {
        setContent(e.target?.result as string || '')
        setLoading(false)
      }
      reader.onerror = () => {
        setError('Could not read file')
        setLoading(false)
      }
      reader.readAsText(file)
    } else {
      setError('Preview not supported for this file type')
      setLoading(false)
    }
  }, [open, file])

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[#20C15A] border-t-transparent rounded-full animate-spin"></div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="text-center py-8 text-[#E85B5B]">
          {error}
        </div>
      )
    }

    if (file.type.startsWith('image/')) {
      return (
        <div className="max-h-[60vh] overflow-auto">
          <img
            src={content}
            alt={file.name}
            className="max-w-full h-auto mx-auto"
          />
        </div>
      )
    }

    return (
      <div className="max-h-[60vh] overflow-auto">
        <pre className="text-sm text-[#E6EAF2] bg-[#0B0F1A] p-4 rounded-lg border border-[#273244] whitespace-pre-wrap font-mono">
          {content}
        </pre>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-[#131A26] border-[#273244] max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-[#E6EAF2]">
            {file.name} Preview
          </DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}