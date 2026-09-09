import { IFileStorage } from "../interfaces/file-storage.interface.js";
import {
  UploadOptions,
  UploadResult,
  FILE_UPLOAD_CONFIG,
} from "../types/file-types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../common/utils/logger.util.js";

/**
 * Local file storage implementation using Multer
 * This service implements the IFileStorage interface for local disk storage
 */
export class MulterStorageService implements IFileStorage {
  private uploadDir: string;
  private baseUrl: string;

  constructor(uploadDir?: string, baseUrl?: string) {
    this.uploadDir = uploadDir || FILE_UPLOAD_CONFIG.UPLOAD_DIR;
    this.baseUrl = baseUrl || "http://localhost:3011";
  }

  /**
   * Validate that a resolved file path stays within the upload directory.
   * Prevents path traversal attacks (e.g. fileId = "../../../etc/passwd").
   */
  private safePath(fileId: string): string {
    const resolvedUploadDir = path.resolve(this.uploadDir);
    const resolvedPath = path.resolve(this.uploadDir, fileId);
    if (!resolvedPath.startsWith(resolvedUploadDir + path.sep) && resolvedPath !== resolvedUploadDir) {
      throw new Error("Path traversal detected");
    }
    return resolvedPath;
  }

  /**
   * Upload a single file
   */
  async uploadFile(
    file: Express.Multer.File,
    _options?: UploadOptions
  ): Promise<UploadResult> {
    // Use the actual filename as the ID since that's what multer saved
    // This ensures getFile can find the file by its actual name
    const fileId = file.filename;
    const uploadedAt = new Date();

    // File is already saved by multer middleware
    // We just need to return the metadata
    return {
      id: fileId,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      url: `${this.baseUrl}/api/upload/${fileId}`,
      uploadedAt,
    };
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: Express.Multer.File[],
    options?: UploadOptions
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, options));
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a file by ID
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      const filePath = this.safePath(fileId);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      logger.warn("Error deleting file", { fileId, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get file URL
   */
  async getFileUrl(fileId: string): Promise<string> {
    return `${this.baseUrl}/api/upload/${fileId}`;
  }

  /**
   * Get file buffer
   */
  async getFile(fileId: string): Promise<Buffer> {
    try {
      const filePath = this.safePath(fileId);
      return await fs.readFile(filePath);
    } catch {
      throw new Error(`File not found: ${fileId}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(fileId: string): Promise<boolean> {
    try {
      const filePath = this.safePath(fileId);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
