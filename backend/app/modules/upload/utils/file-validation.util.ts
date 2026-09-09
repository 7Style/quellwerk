import crypto from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { FILE_UPLOAD_CONFIG, getAllowedMimeTypes } from '../types/file-types.js';

/**
 * Allowed file extensions. Archive and macro-capable legacy Office formats
 * (.zip, .doc, .xls) are deliberately not accepted.
 */
export const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.docx',
  '.xlsx',
] as const;

/**
 * Validate file MIME type (client supplied Content-Type; see verifyFileSignature
 * for the magic-byte check that runs after the upload)
 */
export const isValidMimeType = (mimetype: string, allowedTypes?: string[]): boolean => {
  const allowed = allowedTypes || getAllowedMimeTypes();
  return allowed.includes(mimetype);
};

/**
 * Validate file size
 */
export const isValidFileSize = (size: number, maxSize?: number): boolean => {
  const limit = maxSize || FILE_UPLOAD_CONFIG.MAX_FILE_SIZE;
  return size <= limit;
};

/**
 * Extract the (lower-cased) extension of a filename, '' when there is none
 */
export const getExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase();
};

/**
 * Validate file extension
 */
export const isValidExtension = (filename: string): boolean => {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(getExtension(filename));
};

/**
 * Sanitize filename to prevent directory traversal attacks
 */
export const sanitizeFilename = (filename: string): string => {
  // Remove any path characters and keep only the filename
  return filename.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Generate unique, unpredictable filename (UUID v4 + allow-listed extension)
 */
export const generateUniqueFilename = (originalName: string): string => {
  const ext = getExtension(originalName);
  const safeExt = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? ext : '';
  return `${crypto.randomUUID()}${safeExt}`;
};

/**
 * Detect the real MIME type from the file content (magic bytes).
 * Returns undefined when the content is not a known binary format.
 */
export const detectMimeTypeFromFile = async (filePath: string): Promise<string | undefined> => {
  const result = await fileTypeFromFile(filePath);
  return result?.mime;
};

export const detectMimeTypeFromBuffer = async (buffer: Uint8Array): Promise<string | undefined> => {
  const result = await fileTypeFromBuffer(buffer);
  return result?.mime;
};

/**
 * Check that the magic bytes of an uploaded file match an allowed type.
 * `image/jpg` is normalised to `image/jpeg`.
 */
export const isAllowedDetectedMimeType = (detected: string | undefined, allowedTypes?: string[]): boolean => {
  if (!detected) return false;
  const allowed = (allowedTypes || getAllowedMimeTypes()).map((type) =>
    type === 'image/jpg' ? 'image/jpeg' : type
  );
  return allowed.includes(detected);
};

/**
 * Get file extension from mimetype
 */
export const getExtensionFromMimetype = (mimetype: string): string => {
  const mimetypeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };

  return mimetypeMap[mimetype] || '';
};
