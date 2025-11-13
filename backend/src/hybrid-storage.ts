import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Attribute,
  type Chain,
  type Hex,
  type PublicArkivClient,
  type WalletArkivClient,
} from '@arkiv-network/sdk';
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts';
import { kaolin } from '@arkiv-network/sdk/chains';
import { NoEntityFoundError } from '@arkiv-network/sdk/query';
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils';
import crypto from 'crypto';
import { filesDBClient } from './filesdb-client';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const BLOCK_TIME_SECONDS = 2

interface StorageItem {
  kind: 'text' | 'file'
  content: string
  fileName?: string
  fileType?: string
  fileSize?: number
  fileData?: string
  userId?: string
  createdAt: number
  expiresAt: number
}

interface EntityMetadata {
  id: string
  kind: 'text' | 'file'
  fileName?: string
  fileType?: string
  fileSize?: number
  userId?: string
  createdAt: number
  expiresAt: number
  checksum: string
  filesDbId: string
}

type AttributeValue = string | number

export class HybridStorage {
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
      console.log('🔄 Initializing Hybrid Storage (Kaolin + FilesDB)...')

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

      console.log('🚀 Hybrid Storage ready')
    } catch (error) {
      console.error('❌ Failed to initialize Hybrid Storage:', error)
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

  async healthCheck(): Promise<any> {
    await this.initialized

    try {
      const client = this.getPublicClient()
      const { currentBlock, blockDuration } = await client.getBlockTiming()

      return {
        status: 'ok',
        details: {
          chainId: this.chainId,
          currentBlock: Number(currentBlock),
          blockDuration,
          hasWriteAccess: !!this.walletClient,
          rpcUrl: this.rpcUrl,
        },
      }
    } catch (error) {
      return {
        status: 'error',
        details: { error: toErrorMessage(error) },
      }
    }
  }

  async storeItem(item: StorageItem, ttlDays: number = 7): Promise<string> {
    await this.initialized

    if (!this.walletClient) {
      throw new Error('Write client not available')
    }

    try {
      const id = crypto.randomBytes(16).toString('hex')

      let filesDbId: string
      if (item.kind === 'text') {
        filesDbId = await filesDBClient.uploadText(item.content, 'clipboard.txt', ttlDays)
      } else if (item.kind === 'file' && item.fileData) {
        const buffer = Buffer.from(item.fileData, 'base64')
        filesDbId = await filesDBClient.uploadFile(
          buffer,
          item.fileName || 'file',
          item.fileType || 'application/octet-stream',
          ttlDays,
        )
      } else {
        throw new Error('Invalid clipboard item')
      }

      const metadataContent = {
        kind: item.kind,
        fileName: item.fileName,
        fileType: item.fileType,
        filesDbId,
      }
      const payloadBuffer = Buffer.from(jsonToPayload(metadataContent))
      const checksum = this.calculateChecksum(payloadBuffer)

      const expirationDate = new Date(item.expiresAt)
      const expiresInSeconds = this.calculateExpiresInSeconds(expirationDate)
  const approxBtl = Math.max(1, Math.floor(expiresInSeconds / BLOCK_TIME_SECONDS))

      console.log(
        `📦 Storing ${item.kind} item metadata in Kaolin, data in FilesDB (${filesDbId}), expires in ${expiresInSeconds}s (~BTL ${approxBtl})`,
      )

      const attributes: Attribute[] = [
        { key: 'type', value: 'copypal_hybrid' },
        { key: 'item_id', value: id },
        { key: 'kind', value: item.kind },
        { key: 'checksum', value: checksum },
        { key: 'filesdb_id', value: filesDbId },
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
        contentType: 'application/json',
        expiresIn: expiresInSeconds,
      })

      console.log(`✅ Hybrid item stored - Kaolin entity: ${entityKey}, FilesDB: ${filesDbId} (tx: ${txHash})`)
      return entityKey
    } catch (error) {
      console.error('❌ Failed to store hybrid item:', error)
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
      if (entityType !== 'copypal_hybrid') {
        return null
      }

      const filesDbId = this.getStringAttribute(attributesMap, 'filesdb_id')
      if (!filesDbId) {
        throw new Error('FilesDB ID not found in metadata')
      }

      const kind = (this.getStringAttribute(attributesMap, 'kind') as 'text' | 'file') || 'text'
      const createdAt = this.getNumericAttribute(attributesMap, 'created_at') ?? 0
      const expiresAt = this.getNumericAttribute(attributesMap, 'expires_at') ?? 0

      if (expiresAt && Date.now() > expiresAt) {
        return null
      }

      if (kind === 'text') {
        const content = await filesDBClient.downloadText(filesDbId)
        return {
          kind: 'text',
          content,
          fileName: this.getStringAttribute(attributesMap, 'file_name'),
          fileType: this.getStringAttribute(attributesMap, 'file_type'),
          fileSize: this.getNumericAttribute(attributesMap, 'file_size'),
          userId: this.getStringAttribute(attributesMap, 'user_id'),
          createdAt,
          expiresAt,
        }
      }

      const { data, info } = await filesDBClient.downloadFile(filesDbId)
      const fileName = this.getStringAttribute(attributesMap, 'file_name') || info.original_filename
      const fileType = this.getStringAttribute(attributesMap, 'file_type') || info.content_type
      const fileSize = this.getNumericAttribute(attributesMap, 'file_size') ?? info.total_size
      const base64Data = data.toString('base64')

      return {
        kind: 'file',
        content: fileName || 'file',
        fileName,
        fileType,
        fileSize,
        fileData: base64Data,
        userId: this.getStringAttribute(attributesMap, 'user_id'),
        createdAt,
        expiresAt,
      }
    } catch (error) {
      if (error instanceof NoEntityFoundError) {
        return null
      }

      console.error('❌ Failed to get hybrid item:', error)
      return null
    }
  }

  async getUserItems(userId: string): Promise<Array<{ entityKey: string; item: EntityMetadata }>> {
    console.log(`⚠️ User items listing not implemented for hybrid storage (requested by ${userId})`)
    return []
  }
}

export const hybridStorage = new HybridStorage()
