import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface HelpModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#131A26] border-[#273244]">
        <DialogHeader>
          <DialogTitle className="text-[#E6EAF2]">Need a hand?</DialogTitle>
          <DialogDescription className="text-[#9AA7BD]">
            Learn about Proof of Work, limits, and privacy in CopyPal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-[#E6EAF2]">
          <section>
            <h4 className="font-semibold mb-2">Proof of Work</h4>
            <p className="text-[#9AA7BD] text-sm">
              We use an in-browser check to keep spam away. It usually takes a few seconds.
            </p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">Limits</h4>
            <p className="text-[#9AA7BD] text-sm">
              Free tier: 50 clips per day, 10 requests per hour, max 64KB text or 64MB per file.
            </p>
          </section>
          <section>
            <h4 className="font-semibold mb-2">Privacy</h4>
            <p className="text-[#9AA7BD] text-sm">
              Clips auto-expire and links contain random tokens. We never index your content.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}