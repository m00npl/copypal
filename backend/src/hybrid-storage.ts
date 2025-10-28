import { createArkivROClient, createArkivClient } from 'arkiv-sdk';
import crypto from 'crypto';
import { filesDBClient } from './filesdb-client';

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

interface EntityMetadata {
  id: string;
  kind: 'text' | 'file';
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  userId?: string;
  createdAt: number;
  expiresAt: number;
  checksum: string;
  filesDbId: string; // FilesDB file ID
}

export class HybridStorage {
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
      console.log('🔄 Initializing Hybrid Storage (Kaolin + FilesDB)...');

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

      console.log('🚀 Hybrid Storage ready');
    } catch (error) {
      console.error('❌ Failed to initialize Hybrid Storage:', error);
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
        const block = await rawClient.eth_blockNumber();
        return parseInt(block, 16);
      }
      return Date.now(); // Fallback
    } catch (error) {
      console.log('Could not get current block, using timestamp:', toErrorMessage(error));
      return Date.now();
    }
  }

  private calculateBTL(expirationDate: Date): number {
    const now = new Date();
    const diffMs = expirationDate.getTime() - now.getTime();
    const diffBlocks = Math.max(1, Math.ceil(diffMs / 12000)); // ~12 seconds per block
    return diffBlocks;
  }

  async healthCheck(): Promise<any> {
    await this.initialized;

    try {
      const currentBlock = await this.getCurrentBlock();
      return {
        status: 'ok',
        details: {
          chainId: this.chainId,
          currentBlock,
          hasWriteAccess: !!this.writeClient,
          rpcUrl: this.rpcUrl
        }
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: toErrorMessage(error) }
      };
    }
  }

  async storeItem(item: StorageItem, ttlDays: number = 7): Promise<string> {
    await this.initialized;

    if (!this.writeClient) {
      throw new Error('Write client not available');
    }

    try {
      const id = crypto.randomBytes(16).toString('hex');

      // 1. Store data in FilesDB
      let filesDbId: string;
      if (item.kind === 'text') {
        filesDbId = await filesDBClient.uploadText(item.content, 'clipboard.txt', ttlDays);
      } else if (item.kind === 'file' && item.fileData) {
        const buffer = Buffer.from(item.fileData, 'base64');
        filesDbId = await filesDBClient.uploadFile(buffer, item.fileName || 'file', item.fileType || 'application/octet-stream', ttlDays);
      } else {
        throw new Error('Invalid clipboard item');
      }

      // 2. Create checksum for metadata integrity
      const metadataContent = JSON.stringify({
        kind: item.kind,
        fileName: item.fileName,
        fileType: item.fileType,
        filesDbId
      });
      const contentBuffer = Buffer.from(metadataContent, 'utf8');
      const checksum = this.calculateChecksum(contentBuffer);

      // 3. Calculate BTL from expiration date
      const expirationDate = new Date(item.expiresAt);
      const btl = this.calculateBTL(expirationDate);

      console.log(`📦 Storing ${item.kind} item metadata in Kaolin, data in FilesDB (${filesDbId}), BTL: ${btl}`);

      // 4. Store metadata in Kaolin
      const result = await this.writeClient.createEntities([{
        btl: btl,
        data: contentBuffer,
        stringAnnotations: [
          { key: 'type', value: 'copypal_hybrid' },
          { key: 'item_id', value: id },
          { key: 'kind', value: item.kind },
          { key: 'checksum', value: checksum },
          { key: 'filesdb_id', value: filesDbId }, // Link to FilesDB
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

      console.log(`✅ Hybrid item stored - Kaolin entity: ${entityKey}, FilesDB: ${filesDbId}`);
      return entityKey;

    } catch (error) {
      console.error('❌ Failed to store hybrid item:', error);
      throw error;
    }
  }

  async getItem(entityKey: string): Promise<StorageItem | null> {
    await this.initialized;

    try {
      // 1. Get metadata from Kaolin
      const metadata = await this.roClient.getEntityMetaData(entityKey);
      if (!metadata) {
        return null;
      }

      // Check if it's a CopyPal hybrid item
      const isTargetType = metadata.stringAnnotations.some(
        (ann: any) => ann.key === 'type' && ann.value === 'copypal_hybrid'
      );

      if (!isTargetType) {
        return null;
      }

      // Parse annotations
      const getStringAnnotation = (key: string): string | undefined => {
        return metadata.stringAnnotations.find((ann: any) => ann.key === key)?.value;
      };

      const getNumericAnnotation = (key: string): number | undefined => {
        return metadata.numericAnnotations.find((ann: any) => ann.key === key)?.value;
      };

      const filesDbId = getStringAnnotation('filesdb_id');
      if (!filesDbId) {
        throw new Error('FilesDB ID not found in metadata');
      }

      const kind = getStringAnnotation('kind') as 'text' | 'file';

      // 2. Get data from FilesDB
      if (kind === 'text') {
        const content = await filesDBClient.downloadText(filesDbId);
        return {
          kind: 'text',
          content,
          fileName: getStringAnnotation('file_name'),
          fileType: getStringAnnotation('file_type'),
          fileSize: getNumericAnnotation('file_size'),
          userId: getStringAnnotation('user_id'),
          createdAt: getNumericAnnotation('created_at') || 0,
          expiresAt: getNumericAnnotation('expires_at') || 0
        };
      } else {
        const { data } = await filesDBClient.downloadFile(filesDbId);
        const fileData = data.toString('base64');

        return {
          kind: 'file',
          content: getStringAnnotation('file_name') || 'file',
          fileName: getStringAnnotation('file_name'),
          fileType: getStringAnnotation('file_type'),
          fileSize: getNumericAnnotation('file_size'),
          fileData,
          userId: getStringAnnotation('user_id'),
          createdAt: getNumericAnnotation('created_at') || 0,
          expiresAt: getNumericAnnotation('expires_at') || 0
        };
      }

    } catch (error) {
      console.error('❌ Failed to get hybrid item:', error);
      return null;
    }
  }

  async getUserItems(userId: string): Promise<Array<{ entityKey: string; item: EntityMetadata }>> {
    // For now, return empty array as this would require complex querying
    console.log(`⚠️ User items listing not implemented for hybrid storage (requested by ${userId})`);
    return [];
  }
}

export const hybridStorage = new HybridStorage();
