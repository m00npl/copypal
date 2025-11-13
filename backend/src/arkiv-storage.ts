import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Attribute,
  type Chain,
  type Hex,
  type MimeType,
  type PublicArkivClient,
  type WalletArkivClient,
} from '@arkiv-network/sdk';
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts';
import { kaolin } from '@arkiv-network/sdk/chains';
import { NoEntityFoundError } from '@arkiv-network/sdk/query';
import { ExpirationTime, stringToPayload } from '@arkiv-network/sdk/utils';
import crypto from 'crypto';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const BLOCK_TIME_SECONDS = 2

interface StorageItem {
  kind: 'text' | 'file';
  content: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileData?: string;
  userId?: string;
  createdAt: number;
  expiresAt: number;
}

type AttributeValue = string | number

const KNOWN_MIME_TYPES: ReadonlySet<MimeType> = new Set([
  'text/plain',
  'text/html',
  'text/css',
  'text/csv',
  'text/xml',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/octet-stream',
  'application/javascript',
  'application/x-www-form-urlencoded',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'multipart/form-data'
])

export class ArkivStorage {
  private publicClient: PublicArkivClient | null = null
  private walletClient: WalletArkivClient | null = null
  private readonly initialized: Promise<void>
  private readonly chainId: number
  private readonly rpcUrl: string
  private readonly wsUrl: string
  private readonly chain: Chain

  constructor() {
    this.chainId = parseInt(process.env.ARKIV_CHAIN_ID || '60138453025', 10)
    this.rpcUrl = process.env.ARKIV_RPC_URL || 'https://kaolin.hoodi.arkiv.network/rpc'
    this.wsUrl = process.env.ARKIV_WS_URL || 'wss://kaolin.hoodi.arkiv.network/rpc/ws'
    this.chain = this.buildChain()

    this.initialized = this.initializeClients()
  }

  private buildChain(): Chain {
    const defaultHttp = kaolin.rpcUrls.default.http[0]
    const defaultWs = kaolin.rpcUrls.default.webSocket?.[0]

    const usingDefaults =
      this.chainId === kaolin.id && this.rpcUrl === defaultHttp && (!this.wsUrl || this.wsUrl === defaultWs)

    if (usingDefaults) {
      return kaolin
    }

    return defineChain({
      id: this.chainId,
      name: kaolin.name,
      network: kaolin.network,
      nativeCurrency: kaolin.nativeCurrency,
      rpcUrls: {
        default: {
          http: [this.rpcUrl],
          ...(this.wsUrl ? { webSocket: [this.wsUrl] as [string] } : {}),
        },
      },
      blockExplorers: kaolin.blockExplorers,
      testnet: kaolin.testnet,
    })
  }

  private async initializeClients(): Promise<void> {
    try {
      console.log('🔄 Initializing Arkiv storage...')

      this.publicClient = createPublicClient({
        chain: this.chain,
        transport: http(this.rpcUrl),
      })
      console.log('✅ Read-only client initialized')

      const privateKey = process.env.ARKIV_PRIVATE_KEY
      if (privateKey) {
        const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
        const account = privateKeyToAccount(normalizedKey as Hex)

        this.walletClient = createWalletClient({
          chain: this.chain,
          transport: http(this.rpcUrl),
          account,
        })
        console.log('✅ Write client initialized')
      } else {
        console.log('⚠️ No private key - read-only mode')
      }

      console.log('🚀 Arkiv storage ready')
    } catch (error) {
      console.error('❌ Failed to initialize Arkiv storage:', error)
      throw error
    }
  }

  private getPublicClient(): PublicArkivClient {
    if (!this.publicClient) {
      throw new Error('Arkiv public client not ready')
    }
    return this.publicClient
  }

  private calculateChecksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  private calculateExpiresInSeconds(expirationDate: Date): number {
    const seconds = ExpirationTime.fromDate(expirationDate)
    return Math.max(seconds, BLOCK_TIME_SECONDS)
  }

  private resolveContentType(item: StorageItem): MimeType {
    if (item.kind === 'text') {
      return 'text/plain'
    }

    if (item.fileType && KNOWN_MIME_TYPES.has(item.fileType as MimeType)) {
      return item.fileType as MimeType
    }

    return 'application/octet-stream'
  }

  private attributesToMap(attributes: Attribute[]): Map<string, AttributeValue> {
    return new Map(attributes.map(({ key, value }) => [key, value]))
  }

  private getStringAttribute(map: Map<string, AttributeValue>, key: string): string | undefined {
    const value = map.get(key)
    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toString() : undefined
    }
    return undefined
  }

  private getNumericAttribute(map: Map<string, AttributeValue>, key: string): number | undefined {
    const value = map.get(key)
    if (typeof value === 'number') {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    return undefined
  }

  async storeItem(item: StorageItem): Promise<string> {
    await this.initialized

    if (!this.walletClient) {
      throw new Error('Write operations not available - no private key configured')
    }

    try {
      const id = crypto.randomBytes(16).toString('hex')

      const payloadBuffer =
        item.kind === 'file' && item.fileData
          ? Buffer.from(item.fileData, 'base64')
          : Buffer.from(stringToPayload(item.content))

  const checksum = this.calculateChecksum(payloadBuffer)
      const expirationDate = new Date(item.expiresAt)
      const expiresInSeconds = this.calculateExpiresInSeconds(expirationDate)
  const approxBtl = Math.max(1, Math.floor(expiresInSeconds / BLOCK_TIME_SECONDS))

      console.log(
        `📦 Storing ${item.kind} item, size: ${payloadBuffer.length} bytes, expires in ${expiresInSeconds}s (~BTL ${approxBtl})`,
      )

      const attributes: Attribute[] = [
        { key: 'type', value: 'copypal_content' },
        { key: 'item_id', value: id },
        { key: 'kind', value: item.kind },
        { key: 'checksum', value: checksum },
      ]

      if (item.fileName) {
        attributes.push({ key: 'file_name', value: item.fileName })
      }
      if (item.fileType) {
        attributes.push({ key: 'file_type', value: item.fileType })
      }
      if (item.userId) {
        attributes.push({ key: 'user_id', value: item.userId })
      }
      if (typeof item.fileSize === 'number') {
        attributes.push({ key: 'file_size', value: item.fileSize })
      }

      attributes.push({ key: 'created_at', value: item.createdAt })
      attributes.push({ key: 'expires_at', value: item.expiresAt })

      const { entityKey, txHash } = await this.walletClient.createEntity({
        payload: payloadBuffer,
        attributes,
        contentType: this.resolveContentType(item),
        expiresIn: expiresInSeconds,
      })

      console.log(`✅ Item stored with entity key: ${entityKey} (tx: ${txHash})`)
      return entityKey
    } catch (error) {
      console.error('❌ Failed to store item:', error)
      throw error
    }
  }

  async getItem(entityKey: string): Promise<StorageItem | null> {
    await this.initialized

    try {
      const client = this.getPublicClient()
      const entity = await client.getEntity(entityKey as Hex)

      const attributesMap = this.attributesToMap(entity.attributes)
      const entityType = this.getStringAttribute(attributesMap, 'type')
      if (entityType !== 'copypal_content') {
        return null
      }

      if (!entity.payload) {
        return null
      }

      const kind = (this.getStringAttribute(attributesMap, 'kind') as 'text' | 'file') || 'text'
      const createdAt = this.getNumericAttribute(attributesMap, 'created_at') ?? Date.now()
      const expiresAt =
        this.getNumericAttribute(attributesMap, 'expires_at') ?? Date.now() + 24 * 60 * 60 * 1000

      if (Date.now() > expiresAt) {
        return null
      }

      const payloadBuffer = Buffer.from(entity.payload)
      const base64Data = payloadBuffer.toString('base64')

      const result: StorageItem = {
        kind,
        content: kind === 'text' ? payloadBuffer.toString('utf8') : base64Data,
        fileName: this.getStringAttribute(attributesMap, 'file_name'),
        fileType: this.getStringAttribute(attributesMap, 'file_type'),
        fileSize: this.getNumericAttribute(attributesMap, 'file_size'),
        fileData: kind === 'file' ? base64Data : undefined,
        userId: this.getStringAttribute(attributesMap, 'user_id'),
        createdAt,
        expiresAt,
      }

      return result
    } catch (error) {
      if (error instanceof NoEntityFoundError) {
        return null
      }

      console.error('❌ Failed to get item:', error)
      return null
    }
  }

  async getUserItems(userId: string): Promise<Array<{ entityKey: string; item: StorageItem }>> {
    await this.initialized

    try {
      console.log(`🔍 Querying items for user: ${userId}`)
      console.log('⚠️ User-specific queries not yet implemented - requires owner address mapping')
      return []
    } catch (error) {
      console.error('❌ Failed to get user items:', error)
      return []
    }
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    await this.initialized

    try {
      const client = this.getPublicClient()
      const entityCount = await client.getEntityCount()

      const writeTest = this.walletClient?.account
        ? { ownerAddress: this.walletClient.account.address }
        : null

      return {
        status: 'ok',
        details: {
          chainId: this.chainId,
          rpcUrl: this.rpcUrl,
          entityCount: entityCount.toString(),
          writeEnabled: !!this.walletClient,
          writeTest,
        },
      }
    } catch (error) {
      return {
        status: 'error',
        details: { error: toErrorMessage(error) },
      }
    }
  }
}

export const arkivStorage = new ArkivStorage()
