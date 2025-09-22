import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Mail, Wallet } from "lucide-react"

interface LoginMethodModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmailClick: () => void
  onWalletClick: () => void
}

export function LoginMethodModal({ open, onOpenChange, onEmailClick, onWalletClick }: LoginMethodModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#131A26] border-[#273244]">
        <DialogHeader>
          <DialogTitle className="text-[#E6EAF2]">Choose your login method</DialogTitle>
          <DialogDescription className="text-[#9AA7BD]">
            Select how you'd like to sign in to CopyPal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            <Button
              variant="secondary"
              className="w-full flex items-center gap-3 p-4 h-auto bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
              onClick={() => {
                onWalletClick()
                onOpenChange(false)
              }}
            >
              <Wallet className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Connect Wallet</div>
                <div className="text-xs text-[#9AA7BD]">Use your Web3 wallet to sign in</div>
              </div>
            </Button>

            <Button
              className="w-full flex items-center gap-3 p-4 h-auto bg-[#20C15A] hover:bg-[#1ca549]"
              onClick={() => {
                onEmailClick()
                onOpenChange(false)
              }}
            >
              <Mail className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Sign in with email</div>
                <div className="text-xs text-[#0B0F1A]/70">Get a magic link sent to your email</div>
              </div>
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-[#9AA7BD]">
              Both methods are secure and don't require passwords
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}