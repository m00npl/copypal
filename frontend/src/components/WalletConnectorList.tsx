import { useConnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'

interface WalletConnectorListProps {
  onConnect?: (address: string) => void
  onCancel?: () => void
}

export function WalletConnectorList({ onConnect, onCancel }: WalletConnectorListProps) {
  const { connectors, connect, isPending } = useConnect()

  const handleConnect = (connector: any) => {
    connect({ connector }, {
      onSuccess: (data) => {
        if (data.accounts[0] && onConnect) {
          onConnect(data.accounts[0])
        }
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {connectors.map((connector) => (
          <Button
            key={connector.uid}
            onClick={() => handleConnect(connector)}
            disabled={isPending}
            className="w-full justify-start bg-[#273244] hover:bg-[#334155] border border-[#3a465a] text-[#E6EAF2]"
          >
            <Wallet className="w-4 h-4 mr-2" />
            {connector.name}
          </Button>
        ))}
      </div>
      {onCancel && (
        <Button
          variant="secondary"
          onClick={onCancel}
          className="w-full bg-[#273244] hover:bg-[#334155] border border-[#3a465a]"
        >
          Cancel
        </Button>
      )}
    </div>
  )
}