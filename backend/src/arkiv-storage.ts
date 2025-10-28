import { createArkivROClient, createArkivClient } from 'arkiv-sdk';
import crypto from 'crypto';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

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

export class ArkivStorage {
  private roClient: any;
  private writeClient: any = null;
  private initialized: Promise<void>;
  private chainId: number;
  private rpcUrl: string;
  private wsUrl: string;

  constructor() {
    this.chainId = parseInt(process.env.ARKIV_CHAIN_ID || '60138453025');
    this.rpcUrl = process.env.ARKIV_RPC_URL || 'https://kaolin.hoodi.arkiv.network/rpc';
    this.wsUrl = process.env.ARKIV_WS_URL || 'wss://kaolin.hoodi.arkiv.network/rpc/ws';

    this.initialized = this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      console.log('🔄 Initializing Arkiv storage...');

      // Always create read-only client
      this.roClient = createArkivROClient(this.chainId, this.rpcUrl, this.wsUrl);
      console.log('✅ Read-only client initialized');

      // Create write client if private key is available
      const privateKey = process.env.ARKIV_PRIVATE_KEY;
      if (privateKey) {
        const accountData = {
          tag: 'privatekey' as const,
          data: Buffer.from(privateKey.slice(2), 'hex')
        };

        this.writeClient = await createArkivClient(this.chainId, accountData, this.rpcUrl, this.wsUrl);
        console.log('✅ Write client initialized');
      } else {
        console.log('⚠️ No private key - read-only mode');
      }

      console.log('🚀 Arkiv storage ready');
    } catch (error) {
      console.error('❌ Failed to initialize Arkiv storage:', error);
      throw error;
    }
  }

  private calculateChecksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async getCurrentBlock(): Promise<number> {
    try {
      if (this.writeClient?.getRawClient) {
        const rawClient = this.writeClient.getRawClient();
        return await rawClient.httpClient.getBlockNumber();
      }
      return Math.floor(Date.now() / 1000 / 2);
    } catch (error) {
      const message = toErrorMessage(error);
      console.warn('Failed to get current block; using timestamp fallback:', message);
      return Math.floor(Date.now() / 1000 / 2);
    }
  }

  private calculateBTL(expirationDate: Date): number {
    const currentBlock = Math.floor(Date.now() / 1000 / 2);
    const expirationBlock = Math.floor(expirationDate.getTime() / 1000 / 2);
    return Math.max(1, expirationBlock - currentBlock);
  }

  async storeItem(item: StorageItem): Promise<string> {
    await this.initialized;

    if (!this.writeClient) {
      throw new Error('Write operations not available - no private key configured');
    }

    try {
      const id = crypto.randomBytes(16).toString('hex');

      // Prepare content as buffer
      let contentBuffer: Buffer;
      if (item.kind === 'file' && item.fileData) {
        contentBuffer = Buffer.from(item.fileData, 'base64');
      } else {
        contentBuffer = Buffer.from(item.content, 'utf8');
      }

      const checksum = this.calculateChecksum(contentBuffer);

      // Calculate BTL from expiration date
      const expirationDate = new Date(item.expiresAt);
      const btl = this.calculateBTL(expirationDate);

      console.log(`📦 Storing ${item.kind} item, size: ${contentBuffer.length} bytes, BTL: ${btl}`);

      // Store content
      const result = await this.writeClient.createEntities([{
        btl: btl,
        data: contentBuffer,
        stringAnnotations: [
          { key: 'type', value: 'copypal_content' },
          { key: 'item_id', value: id },
          { key: 'kind', value: item.kind },
          { key: 'checksum', value: checksum },
          ...(item.fileName ? [{ key: 'file_name', value: item.fileName }] : []),
          ...(item.fileType ? [{ key: 'file_type', value: item.fileType }] : []),
          ...(item.userId ? [{ key: 'user_id', value: item.userId }] : [])
        ],
        numericAnnotations: [
          { key: 'created_at', value: item.createdAt },
          { key: 'expires_at', value: item.expiresAt },
          ...(item.fileSize ? [{ key: 'file_size', value: item.fileSize }] : [])
        ]
      }]);

      const entityKey = result[0].entityKey;

      console.log(`✅ Item stored with entity key: ${entityKey}`);
      return entityKey;

    } catch (error) {
      console.error('❌ Failed to store item:', error);
      throw error;
    }
  }

  async getItem(entityKey: string): Promise<StorageItem | null> {
    await this.initialized;

    try {
      // Get metadata
      const metadata = await this.roClient.getEntityMetaData(entityKey);
      if (!metadata) {
        return null;
      }

      // Check if it's a CopyPal item
      const isTargetType = metadata.stringAnnotations.some(
        (ann: any) => ann.key === 'type' && ann.value === 'copypal_content'
      );

      if (!isTargetType) {
        return null;
      }

      // Get content data
      const data = await this.roClient.getStorageValue(entityKey);
      if (!data) {
        return null;
      }

      // Parse annotations
      const getStringAnnotation = (key: string): string | undefined => {
        return metadata.stringAnnotations.find((ann: any) => ann.key === key)?.value;
      };

      const getNumericAnnotation = (key: string): number | undefined => {
        const value = metadata.numericAnnotations.find((ann: any) => ann.key === key)?.value;
        return value ? Number(value) : undefined;
      };

      const kind = getStringAnnotation('kind') as 'text' | 'file' || 'text';
      const createdAt = getNumericAnnotation('created_at') || Date.now();
      const expiresAt = getNumericAnnotation('expires_at') || Date.now() + 24 * 60 * 60 * 1000;

      // Check if expired
      if (Date.now() > expiresAt) {
        return null;
      }

      // Build result
      const result: StorageItem = {
        kind,
        content: kind === 'text' ? data.toString('utf8') : data.toString('base64'),
        fileName: getStringAnnotation('file_name'),
        fileType: getStringAnnotation('file_type'),
        fileSize: getNumericAnnotation('file_size'),
        fileData: kind === 'file' ? data.toString('base64') : undefined,
        userId: getStringAnnotation('user_id'),
        createdAt,
        expiresAt
      };

      return result;

    } catch (error) {
      console.error('❌ Failed to get item:', error);
      return null;
    }
  }

  async getUserItems(userId: string): Promise<Array<{ entityKey: string; item: StorageItem }>> {
    await this.initialized;

    try {
      // For now, we'll need to get all entities and filter
      // This is not optimal but Arkiv doesn't have efficient querying yet
      console.log(`🔍 Querying items for user: ${userId}`);

      // This would require knowing the owner address
      // For now, return empty array as we can't efficiently query by user
      console.log('⚠️ User-specific queries not yet implemented - requires owner address mapping');
      return [];

    } catch (error) {
      console.error('❌ Failed to get user items:', error);
      return [];
    }
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    await this.initialized;

    try {
      // Test read operations
      const entityCount = await this.roClient.getEntityCount();

      let writeTest = null;
      if (this.writeClient) {
        const ownerAddress = await this.writeClient.getOwnerAddress();
        writeTest = { ownerAddress };
      }

      return {
        status: 'ok',
        details: {
          chainId: this.chainId,
          rpcUrl: this.rpcUrl,
          entityCount: entityCount.toString(),
          writeEnabled: !!this.writeClient,
          writeTest
        }
      };

    } catch (error) {
      return {
        status: 'error',
        details: { error: toErrorMessage(error) }
      };
    }
  }
}

// Export singleton instance
export const arkivStorage = new ArkivStorage();
