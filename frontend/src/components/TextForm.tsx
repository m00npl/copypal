import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ExpirationPicker } from "./ExpirationPicker"
import { Link as LinkIcon } from "lucide-react"

interface TextFormProps {
  onCreateLink: (data: { content: string; expiresAt: Date }) => Promise<void>
}

export function TextForm({ onCreateLink }: TextFormProps) {
  const [value, setValue] = useState('')
  const [preset, setPreset] = useState<'15m' | '1h' | '1d' | '7d' | 'custom'>('1h')
  const [customDate, setCustomDate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const maxLength = 65536

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

  const handleCreateLink = async () => {
    if (!value.trim()) return

    setIsLoading(true)
    try {
      await onCreateLink({
        content: value,
        expiresAt: getExpiresAt()
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getCharacterCountColor = () => {
    const ratio = value.length / maxLength
    if (ratio > 0.9) return 'text-[#E85B5B]'
    if (ratio > 0.75) return 'text-yellow-500'
    return 'text-[#9AA7BD]'
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[#E6EAF2] font-medium">Paste or type your text</h3>
          <span className={`text-sm ${getCharacterCountColor()}`}>
            {value.length} / {maxLength}
          </span>
        </div>

        <Textarea
          className="min-h-[120px] resize-none bg-[#0B0F1A] border-[#273244] text-[#E6EAF2] placeholder:text-[#9AA7BD] focus:border-[#20C15A] focus:ring-1 focus:ring-[#20C15A]"
          placeholder="Paste or type your text snippet…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={maxLength}
        />

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={!value.trim()}
            onClick={() => setValue('')}
            className="text-[#9AA7BD] hover:text-[#E6EAF2] hover:bg-[#273244]"
          >
            Clear
          </Button>
        </div>
      </div>

      <ExpirationPicker
        preset={preset}
        onPresetChange={setPreset}
        customDate={customDate}
        onCustomDateChange={setCustomDate}
      />

      <Button
        className="w-full bg-[#20C15A] hover:bg-[#1ca549] text-white"
        disabled={!value.trim() || isLoading}
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
            Create link
          </div>
        )}
      </Button>
    </div>
  )
}