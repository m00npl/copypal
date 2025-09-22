import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WalletConnectorList } from "@/components/WalletConnectorList"

interface WalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: (address: string) => void
}

export function WalletModal({ open, onOpenChange, onConnect }: WalletModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#131A26] border-[#273244]">
        <DialogHeader>
          <DialogTitle className="text-[#E6EAF2]">Connect Wallet</DialogTitle>
          <DialogDescription className="text-[#9AA7BD]">
            Choose your wallet to connect to CopyPal.
          </DialogDescription>
        </DialogHeader>
        <WalletConnectorList
          onConnect={(address) => {
            onConnect?.(address)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}