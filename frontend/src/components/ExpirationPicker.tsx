import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Clock } from "lucide-react"
import { useEta } from "@/hooks/useEta"
import { CustomExpirationModal } from "./modals/CustomExpirationModal"

interface ExpirationPickerProps {
  preset: '15m' | '1h' | '1d' | '7d' | 'custom'
  onPresetChange: (preset: '15m' | '1h' | '1d' | '7d' | 'custom') => void
  customDate: Date | null
  onCustomDateChange: (date: Date | null) => void
}

const PRESETS = [
  { label: "15 min", value: "15m" as const },
  { label: "1 hour", value: "1h" as const },
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
]

export function ExpirationPicker({ preset, onPresetChange, customDate, onCustomDateChange }: ExpirationPickerProps) {
  const [customModalOpen, setCustomModalOpen] = useState(false)

  const expiresAt = getExpiresAt(preset, customDate)
  const eta = useEta(expiresAt)

  const formatShortExpiration = (preset: string, customDate: Date | null) => {
    if (preset === 'custom' && customDate) {
      const diff = customDate.getTime() - Date.now()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const days = Math.floor(hours / 24)

      if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''}`
      } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`
      } else {
        return 'less than 1 hour'
      }
    }

    const map: Record<string, string> = {
      '15m': '15 minutes',
      '1h': '1 hour',
      '1d': '1 day',
      '7d': '7 days'
    }
    return map[preset] || preset
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm text-[#9AA7BD]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Expiration</span>
          </div>
          <span>ETA: {eta}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-[#9AA7BD]">Expires in {formatShortExpiration(preset, customDate)}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((presetOption) => {
            const active = preset === presetOption.value
            return (
              <Button
                key={presetOption.value}
                variant={active ? "default" : "secondary"}
                size="sm"
                onClick={() => onPresetChange(presetOption.value)}
                className={active
                  ? "bg-[#20C15A] hover:bg-[#1ca549] text-white"
                  : "bg-[#273244] hover:bg-[#334155] border border-[#3a465a] text-[#E6EAF2]"
                }
              >
                {presetOption.label}
              </Button>
            )
          })}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCustomModalOpen(true)}
            className={preset === 'custom'
              ? "bg-[#20C15A] hover:bg-[#1ca549] text-white"
              : "bg-[#273244] hover:bg-[#334155] border border-[#3a465a] text-[#E6EAF2]"
            }
          >
            Custom…
          </Button>
        </div>
      </div>

      <CustomExpirationModal
        open={customModalOpen}
        onOpenChange={setCustomModalOpen}
        onSave={(date) => {
          onCustomDateChange(date)
          onPresetChange('custom')
        }}
      />
    </>
  )
}

function getExpiresAt(preset: string, customDate: Date | null): Date {
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