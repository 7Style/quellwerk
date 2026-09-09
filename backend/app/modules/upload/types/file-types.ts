/**
 * File metadata information
 */
export interface FileMetadata {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  uploadedBy?: number;
}

/**
 * Options for file upload
 */
export interface UploadOptions {
  folder?: string;
  maxSize?: number;
  allowedMimeTypes?: string[];
  preserveOriginalName?: boolean;
}

/**
 * Result of file upload operation
 */
export interface UploadResult {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  uploadedAt: Date;
}

/**
 * Allowed file types configuration.
 * Archives (.zip) and macro-capable legacy Office formats (.doc/.xls) are not allowed.
 */
export const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  documents: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

/**
 * Get all allowed MIME types
 */
export const getAllowedMimeTypes = (): string[] => {
  return [...ALLOWED_FILE_TYPES.images, ...ALLOWED_FILE_TYPES.documents];
};

/**
 * File upload configuration constants
 */
export const FILE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB in bytes
  MAX_FILES: 10,
  UPLOAD_DIR: 'uploads',
  ALLOWED_MIME_TYPES: getAllowedMimeTypes(),
};
