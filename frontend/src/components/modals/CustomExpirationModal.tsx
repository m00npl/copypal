import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import "../../styles/calendar.css"

interface CustomExpirationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (date: Date) => void
}

export function CustomExpirationModal({ open, onOpenChange, onSave }: CustomExpirationModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [timeValue, setTimeValue] = useState('')
  const [error, setError] = useState('')

  // Initialize with tomorrow's date and current time when modal opens
  useEffect(() => {
    if (open) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setSelectedDate(tomorrow)

      const now = new Date()
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      setTimeValue(currentTime)
      setError('')
    } else {
      // Reset state when modal closes
      setSelectedDate(undefined)
      setTimeValue('')
      setError('')
    }
  }, [open])

  const handleSave = () => {
    if (!selectedDate || !timeValue) {
      setError('Please select both date and time')
      return
    }

    try {
      const [hours, minutes] = timeValue.split(':').map(Number)
      const finalDate = new Date(selectedDate)
      finalDate.setHours(hours, minutes, 0, 0)

      const now = new Date()

      if (finalDate <= now) {
        setError('Expiration must be in the future')
        return
      }

      if (finalDate.getTime() - now.getTime() < 60000) {
        setError('Expiration must be at least 1 minute from now')
        return
      }

      onSave(finalDate)
      onOpenChange(false)
    } catch (err) {
      setError('Invalid date/time format')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#131A26] border-[#273244]">
        <DialogHeader>
          <DialogTitle className="text-[#E6EAF2]">Custom expiration</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-[#E6EAF2] mb-3 block">Select date</label>
            <div className="rounded-xl border border-[#273244] bg-gradient-to-br from-[#0B0F1A] to-[#131A26] p-4 shadow-lg">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => {
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  return date < today
                }}
                initialFocus
                className="calendar-custom w-full"
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                  month: "space-y-4",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium text-[#E6EAF2]",
                  nav: "space-x-1 flex items-center",
                  nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-[#E6EAF2]",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex",
                  head_cell: "text-[#9AA7BD] rounded-md w-9 font-normal text-[0.8rem]",
                  row: "flex w-full mt-2",
                  cell: "h-9 w-9 text-center text-sm p-0 relative",
                  day: "h-9 w-9 p-0 font-normal text-[#E6EAF2] hover:bg-[#273244] rounded-md",
                  day_selected: "bg-[#20C15A] text-[#0B0F1A] hover:bg-[#1ca549] hover:text-[#0B0F1A]",
                  day_today: "bg-[#273244] text-[#E6EAF2]",
                  day_outside: "text-[#5A6B7F] opacity-50",
                  day_disabled: "text-[#5A6B7F] opacity-50",
                  day_hidden: "invisible",
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[#E6EAF2] mb-3 block">Select time</label>
            <div className="relative">
              <Input
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="bg-gradient-to-br from-[#0B0F1A] to-[#131A26] border-[#273244] text-[#E6EAF2] focus:border-[#20C15A] focus:ring-2 focus:ring-[#20C15A]/20 h-12 text-base font-medium rounded-xl shadow-md transition-all duration-200 hover:border-[#20C15A]/50"
                placeholder="Select time"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <div className="w-1 h-1 bg-[#20C15A] rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>

          {selectedDate && timeValue && (
            <div className="bg-gradient-to-br from-[#273244] to-[#334155] rounded-xl p-4 border border-[#3a465a] shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-[#20C15A] rounded-full animate-pulse"></div>
                <div className="text-sm font-medium text-[#20C15A]">Selected expiration</div>
              </div>
              <div className="text-[#E6EAF2] font-semibold text-lg">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </div>
              <div className="text-[#9AA7BD] text-sm mt-1">
                at {timeValue}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-gradient-to-br from-[#E85B5B]/10 to-[#dc2626]/10 border border-[#E85B5B]/30 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#E85B5B] rounded-full"></div>
                <p className="text-sm text-[#E85B5B] font-medium">{error}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a] px-6 py-2 rounded-xl transition-all duration-200 hover:shadow-md"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-gradient-to-r from-[#20C15A] to-[#1ca549] hover:from-[#1ca549] hover:to-[#16a346] px-6 py-2 rounded-xl transition-all duration-200 hover:shadow-lg hover:scale-105 font-medium"
            >
              Save expiration
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}