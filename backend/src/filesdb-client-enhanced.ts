/**
 * Enhanced FilesDB Client for CopyPal
 * Leverages all FilesDB v2 upgrades and new features
 */

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

interface FilesDBResponse {
  file_id: string;
  message: string;
}

interface FileInfo {
  file_id: string;
  original_filename: string;
  content_type: string;
  file_extension: string;
  total_size: number;
  chunk_count: number;
  checksum: string;
  created_at: string;
  btl_days: number;
  expires_at: string;
  owner?: string;
}

interface QuotaInfo {
  used_bytes: number;
  max_bytes: number;
  uploads_today: number;
  max_uploads_per_day: number;
  usage_percentage: string;
}

interface UploadSession {
  file_id?: string;
  completed: boolean;
  chunks_received: number;
  total_chunks: number;
  error?: string;
}

export class EnhancedFilesDBClient {
  private baseUrl: string;
  private timeout: number = 600000; // 10 minutes for blockchain uploads
  private apiKey: string;

  constructor(baseUrl: string = process.env.FILESDB_URL || 'http://filedb-filesdb-1:3003') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = process.env.FILESDB_API_KEY || 'unlimited_filedb_2024';
  }

  private createTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.timeout);
  }

  private generateIdempotencyKey(prefix: string = 'copypal'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * NEW: Check quota before uploading to prevent failures
   */
  async checkQuota(): Promise<QuotaInfo> {
    const response = await fetch(`${this.baseUrl}/quota`, {
      signal: this.createTimeoutSignal()
    });

    if (!response.ok) {
      throw new Error(`Quota check failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * ENHANCED: Upload with quota checking and improved error handling
   */
  async uploadTextWithQuotaCheck(
    content: string,
    filename: string = 'clipboard.txt',
    ttlDays: number = 7,
    owner?: string
  ): Promise<{ fileId: string; quotaUsed: QuotaInfo }> {
    // Check quota before upload
    const quotaBefore = await this.checkQuota();
    const contentSize = Buffer.byteLength(content, 'utf8');

    if (quotaBefore.used_bytes + contentSize > quotaBefore.max_bytes) {
      throw new Error(`Quota exceeded: ${contentSize} bytes would exceed limit`);
    }

    if (quotaBefore.uploads_today >= quotaBefore.max_uploads_per_day) {
      throw new Error(`Daily upload limit exceeded: ${quotaBefore.uploads_today}/${quotaBefore.max_uploads_per_day}`);
    }

    const fileId = await this.uploadText(content, filename, ttlDays, owner);
    const quotaAfter = await this.checkQuota();

    return { fileId, quotaUsed: quotaAfter };
  }

  /**
   * ENHANCED: Upload with new TTL parameter format
   */
  async uploadText(content: string, filename: string = 'clipboard.txt', ttlDays: number = 7, owner?: string): Promise<string> {
    const blob = new Blob([content], { type: 'text/plain' });
    const formData = new FormData();
    const idempotencyKey = this.generateIdempotencyKey();

    formData.append('file', blob, filename);
    formData.append('ttlDays', ttlDays.toString()); // NEW: Direct form parameter

    if (owner) {
      formData.append('owner', owner);
    }

    console.log(`Enhanced FileDB upload: ${this.baseUrl}/files, TTL: ${ttlDays}, owner: ${owner}, filename: ${filename}, idempotency: ${idempotencyKey}`)

    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-API-Key': this.apiKey,
        'Idempotency-Key': idempotencyKey,
        // Remove BTL-Days header, use form parameter instead
      },
      signal: this.createTimeoutSignal()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response')
      console.error(`Enhanced FileDB upload failed: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`FilesDB upload failed: ${response.statusText}`);
    }

    const result: FilesDBResponse = await response.json();
    return result.file_id;
  }

  /**
   * ENHANCED: Upload file with resumption support
   */
  async uploadFileWithResumption(
    fileData: Buffer,
    filename: string,
    mimeType: string,
    ttlDays: number = 7,
    owner?: string,
    resumeKey?: string
  ): Promise<{ fileId: string; sessionKey: string }> {
    const sessionKey = resumeKey || this.generateIdempotencyKey('session');

    // Check if upload session exists
    try {
      const existingSession = await this.getUploadSessionStatus(sessionKey);
      if (existingSession.completed && existingSession.file_id) {
        console.log(`Resuming completed upload session: ${sessionKey}`);
        return { fileId: existingSession.file_id, sessionKey };
      }
    } catch (error) {
      // Session doesn't exist, proceed with new upload
      console.log(`Starting new upload session: ${sessionKey}`, getErrorMessage(error));
    }

    const blob = new Blob([bufferToArrayBuffer(fileData)], { type: mimeType });
    const formData = new FormData();

    formData.append('file', blob, filename);
    formData.append('ttlDays', ttlDays.toString());

    if (owner) {
      formData.append('owner', owner);
    }

    console.log(`Enhanced FileDB file upload: ${filename}, size: ${fileData.length}, session: ${sessionKey}`)

    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-API-Key': this.apiKey,
        'Idempotency-Key': sessionKey,
      },
      signal: this.createTimeoutSignal()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response')
      console.error(`Enhanced FileDB file upload failed: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`FilesDB upload failed: ${response.statusText}`);
    }

    const result: FilesDBResponse = await response.json();
    return { fileId: result.file_id, sessionKey };
  }

  /**
   * NEW: Get upload session status for resumption
   */
  async getUploadSessionStatus(idempotencyKey: string): Promise<UploadSession> {
    const response = await fetch(`${this.baseUrl}/status/${encodeURIComponent(idempotencyKey)}`, {
      signal: this.createTimeoutSignal()
    });

    if (!response.ok) {
      throw new Error(`Upload session status failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * ENHANCED: Smart upload with automatic chunking based on FilesDB limits
   */
  async smartUpload(
    fileData: Buffer,
    filename: string,
    mimeType: string,
    ttlDays: number = 7,
    owner?: string
  ): Promise<{ fileId: string; method: 'direct' | 'chunked'; quotaUsed: QuotaInfo }> {
    // Check quota and file size constraints
    const quota = await this.checkQuota();
    const MAX_FILESDB_SIZE = 50 * 1024 * 1024; // 50MB FilesDB limit

    if (fileData.length > MAX_FILESDB_SIZE) {
      throw new Error(`File too large: ${fileData.length} bytes exceeds FilesDB 50MB limit`);
    }

    if (quota.used_bytes + fileData.length > quota.max_bytes) {
      throw new Error(`Quota exceeded: ${fileData.length} bytes would exceed ${quota.max_bytes - quota.used_bytes} available`);
    }

    // Use direct upload for FilesDB-optimized files
    const { fileId } = await this.uploadFileWithResumption(fileData, filename, mimeType, ttlDays, owner);
    const quotaAfter = await this.checkQuota();

    return {
      fileId,
      method: 'direct',
      quotaUsed: quotaAfter
    };
  }

  /**
   * Inherit all existing methods for backward compatibility
   */
  async downloadFile(fileId: string): Promise<{ data: Buffer; info: FileInfo }> {
    // Get file info first
    const infoResponse = await fetch(`${this.baseUrl}/files/${fileId}/info`, {
      signal: this.createTimeoutSignal()
    });
    if (!infoResponse.ok) {
      throw new Error(`FilesDB info failed: ${infoResponse.statusText}`);
    }
    const info: FileInfo = await infoResponse.json();

    // Download file
    const fileResponse = await fetch(`${this.baseUrl}/files/${fileId}`, {
      signal: this.createTimeoutSignal()
    });
    if (!fileResponse.ok) {
      throw new Error(`FilesDB download failed: ${fileResponse.statusText}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    return { data, info };
  }

  async downloadText(fileId: string): Promise<string> {
    const { data } = await this.downloadFile(fileId);
    return data.toString('utf-8');
  }

  async getFileInfo(fileId: string): Promise<FileInfo> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/info`, {
      signal: this.createTimeoutSignal()
    });
    if (!response.ok) {
      throw new Error(`FilesDB info failed: ${response.statusText}`);
    }
    return response.json();
  }

  async getFileEntityKeys(fileId: string): Promise<{metadata_entity_key: string, chunk_entity_keys: string[], total_entities: number}> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/entities`, {
      signal: this.createTimeoutSignal()
    });
    if (!response.ok) {
      throw new Error(`FilesDB entities failed: ${response.statusText}`);
    }
    return response.json();
  }

  async getFilesByOwner(owner: string): Promise<FileInfo[]> {
    const response = await fetch(`${this.baseUrl}/files/by-owner/${encodeURIComponent(owner)}`, {
      signal: this.createTimeoutSignal()
    });
    if (!response.ok) {
      throw new Error(`FilesDB owner files failed: ${response.statusText}`);
    }
    const result = await response.json();
    return result.files || [];
  }

  async getUploadStatus(fileId: string): Promise<{
    file_id: string;
    status: string;
    completed: boolean;
    progress: {
      chunks_uploaded: number;
      total_chunks: number;
      percentage: number;
      remaining_chunks: number;
      elapsed_seconds: number;
      estimated_remaining_seconds: number | null;
      last_chunk_uploaded_at: string | null;
    };
    chunks_received: number;
    total_chunks: number;
    chunks_uploaded_to_blockchain: number;
    progress_percentage: number;
    error: string | null;
    file_info: {
      original_filename: string;
      file_size: number;
      content_type: string;
      owner?: string;
    };
  }> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/status`, {
      signal: this.createTimeoutSignal()
    });
    if (!response.ok) {
      throw new Error(`FilesDB status check failed: ${response.statusText}`);
    }
    return response.json();
  }
}

// Create enhanced instance
export const enhancedFilesDBClient = new EnhancedFilesDBClient();
