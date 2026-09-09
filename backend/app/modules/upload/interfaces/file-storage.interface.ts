import type { UploadOptions, UploadResult } from '../types/file-types.js';

/**
 * File storage interface
 * This interface allows for easy switching between different storage implementations
 * (e.g., local storage with Multer, AWS S3, Google Cloud Storage)
 */
export interface IFileStorage {
  /**
   * Upload a single file
   * @param file - The file to upload (Express.Multer.File format)
   * @param options - Optional upload options
   * @returns Upload result with file metadata
   */
  uploadFile(
    file: Express.Multer.File,
    options?: UploadOptions
  ): Promise<UploadResult>;

  /**
   * Upload multiple files
   * @param files - Array of files to upload
   * @param options - Optional upload options
   * @returns Array of upload results
   */
  uploadFiles(
    files: Express.Multer.File[],
    options?: UploadOptions
  ): Promise<UploadResult[]>;

  /**
   * Delete a file by ID
   * @param fileId - The unique identifier of the file
   * @returns True if deletion was successful
   */
  deleteFile(fileId: string): Promise<boolean>;

  /**
   * Get file URL
   * @param fileId - The unique identifier of the file
   * @returns URL to access the file
   */
  getFileUrl(fileId: string): Promise<string>;

  /**
   * Get file buffer
   * @param fileId - The unique identifier of the file
   * @returns File content as buffer
   */
  getFile(fileId: string): Promise<Buffer>;

  /**
   * Check if file exists
   * @param fileId - The unique identifier of the file
   * @returns True if file exists
   */
  fileExists(fileId: string): Promise<boolean>;
}
