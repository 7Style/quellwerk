import type { IFileStorage } from '../interfaces/file-storage.interface.js';
import type { UploadResult } from '../types/file-types.js';
import { detectMimeTypeFromBuffer } from '../utils/file-validation.util.js';
import { NotFoundException } from '../../../common/exceptions/index.js';

/**
 * Upload service
 * Handles business logic for file uploads. File metadata is not persisted
 * yet; add a `File` model to the Prisma schema when ownership checks are needed.
 */
export class UploadService {
  constructor(private storage: IFileStorage) {}

  /**
   * Upload a single file
   */
  async uploadSingle(file: Express.Multer.File, _userId?: number): Promise<UploadResult> {
    // File is already saved by the multer middleware; return its metadata
    return this.storage.uploadFile(file);
  }

  /**
   * Upload multiple files
   */
  async uploadMultiple(files: Express.Multer.File[], userId?: number): Promise<UploadResult[]> {
    const uploadPromises = files.map((file) => this.uploadSingle(file, userId));
    return Promise.all(uploadPromises);
  }

  /**
   * Get file by ID. The MIME type is detected from the content (magic bytes),
   * never from the request.
   */
  async getFile(fileId: string): Promise<{
    buffer: Buffer;
    mimetype: string;
    filename: string;
  }> {
    if (!(await this.storage.fileExists(fileId))) {
      throw new NotFoundException('File not found');
    }

    const buffer = await this.storage.getFile(fileId);
    const mimetype = (await detectMimeTypeFromBuffer(buffer)) ?? 'application/octet-stream';

    return {
      buffer,
      mimetype,
      filename: fileId,
    };
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, _userId?: number): Promise<boolean> {
    // TODO: check ownership once file metadata is stored in the database
    return this.storage.deleteFile(fileId);
  }

  /**
   * Check if file exists
   */
  async fileExists(fileId: string): Promise<boolean> {
    return this.storage.fileExists(fileId);
  }

  /**
   * Get file URL
   */
  async getFileUrl(fileId: string): Promise<string> {
    return this.storage.getFileUrl(fileId);
  }
}
