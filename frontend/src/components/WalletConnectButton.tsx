import { useAccount, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'

interface WalletConnectButtonProps {
  onConnect?: () => void
  onDisconnect?: () => void
  variant?: 'default' | 'secondary'
  className?: string
}

export function WalletConnectButton({ onConnect, onDisconnect, variant = 'secondary', className }: WalletConnectButtonProps) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const handleDisconnect = () => {
    disconnect()
    if (onDisconnect) {
      onDisconnect()
    }
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#9AA7BD]">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <Button
          variant="secondary"
          onClick={handleDisconnect}
          className="bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
        >
          Disconnect
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant={variant}
      className={`flex items-center gap-2 ${variant === 'secondary' ? 'bg-[#273244] hover:bg-[#334155] border border-[#3a465a]' : ''} ${className || ''}`}
      onClick={onConnect}
    >
      <Wallet className="w-4 h-4" />
      Connect wallet
    </Button>
  )
}