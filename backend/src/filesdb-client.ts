/**
 * FilesDB Client for CopyPal
 * Uses filedb.online as storage backend
 */

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

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

export class FilesDBClient {
  private baseUrl: string;
  private timeout: number = 600000; // 10 minutes for blockchain uploads

  constructor(baseUrl: string = process.env.FILESDB_URL || 'http://filedb-filesdb-1:3003') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private createTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.timeout);
  }

  async uploadText(content: string, filename: string = 'clipboard.txt', ttlDays: number = 7, owner?: string): Promise<string> {
    const blob = new Blob([content], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, filename);

    if (owner) {
      formData.append('owner', owner);
    }

    console.log(`FileDB upload: ${this.baseUrl}/files, TTL: ${ttlDays}, owner: ${owner}, filename: ${filename}`)

    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-API-Key': 'unlimited_filedb_2024',
        'Idempotency-Key': `copypal-${Date.now()}-${Math.random()}`,
        'BTL-Days': ttlDays.toString(),
      },
      signal: this.createTimeoutSignal()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response')
      console.error(`FileDB upload failed: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`FilesDB upload failed: ${response.statusText}`);
    }

    const result: FilesDBResponse = await response.json();
    return result.file_id;
  }

  async uploadFile(fileData: Buffer, filename: string, mimeType: string, ttlDays: number = 7, owner?: string): Promise<string> {
    const blob = new Blob([bufferToArrayBuffer(fileData)], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, filename);

    if (owner) {
      formData.append('owner', owner);
    }

    console.log(`FileDB upload file: ${this.baseUrl}/files, TTL: ${ttlDays}, owner: ${owner}, filename: ${filename}, size: ${fileData.length}`)

    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-API-Key': 'unlimited_filedb_2024',
        'Idempotency-Key': `copypal-${Date.now()}-${Math.random()}`,
        'BTL-Days': ttlDays.toString(),
      },
      signal: this.createTimeoutSignal()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response')
      console.error(`FileDB file upload failed: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`FilesDB upload failed: ${response.statusText}`);
    }

    const result: FilesDBResponse = await response.json();
    return result.file_id;
  }

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

export const filesDBClient = new FilesDBClient();
