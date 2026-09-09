import multer, { type StorageEngine } from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { FILE_UPLOAD_CONFIG } from '../types/file-types.js';
import {
  isValidMimeType,
  isValidExtension,
  generateUniqueFilename,
} from '../utils/file-validation.util.js';

/**
 * True when `target` is `base` itself or located below it
 */
function isInside(base: string, target: string): boolean {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Create multer storage engine with custom configuration
 */
export const createMulterStorage = (uploadDir: string = FILE_UPLOAD_CONFIG.UPLOAD_DIR): StorageEngine => {
  // Ensure upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  return multer.diskStorage({
    destination: (req, _file, cb) => {
      // Sanitize folder name -- only allow alphanumeric, hyphens, underscores
      const body = (req.body ?? {}) as { folder?: unknown };
      const rawFolder = typeof body.folder === 'string' ? body.folder : '';
      const folder = rawFolder.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

      const finalPath = folder ? path.join(uploadDir, folder) : uploadDir;

      // SECURITY: Verify resolved path stays within uploadDir (prevent traversal)
      if (!isInside(uploadDir, finalPath)) {
        cb(new Error('Invalid folder path'), '');
        return;
      }

      // Ensure the destination folder exists
      if (!fs.existsSync(finalPath)) {
        fs.mkdirSync(finalPath, { recursive: true });
      }

      cb(null, finalPath);
    },
    filename: (_req, file, cb) => {
      // Generate unique filename to prevent collisions and guessing
      cb(null, generateUniqueFilename(file.originalname));
    },
  });
};

/**
 * File filter for multer (Content-Type and extension; the magic-byte check
 * happens after the upload, see verifyUploadedFiles)
 */
export const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  // Check MIME type
  const allowedMimeTypes = FILE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES;

  if (!isValidMimeType(file.mimetype, allowedMimeTypes)) {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`));
    return;
  }

  // Check file extension
  if (!isValidExtension(file.originalname)) {
    cb(new Error('Invalid file extension'));
    return;
  }

  cb(null, true);
};

/**
 * Create configured multer instance
 */
export const createMulterInstance = (uploadDir?: string) => {
  return multer({
    storage: createMulterStorage(uploadDir),
    fileFilter: fileFilter,
    limits: {
      fileSize: FILE_UPLOAD_CONFIG.MAX_FILE_SIZE,
      files: FILE_UPLOAD_CONFIG.MAX_FILES,
      fields: 10,
      parts: FILE_UPLOAD_CONFIG.MAX_FILES + 10,
      fieldNameSize: 100,
      fieldSize: 10 * 1024,
    },
  });
};

/**
 * Multer middleware for single file upload
 */
export const uploadSingle = (fieldName: string = 'file', uploadDir?: string) => {
  return createMulterInstance(uploadDir).single(fieldName);
};

/**
 * Multer middleware for multiple files upload
 */
export const uploadMultiple = (
  fieldName: string = 'files',
  maxCount: number = FILE_UPLOAD_CONFIG.MAX_FILES,
  uploadDir?: string
) => {
  return createMulterInstance(uploadDir).array(fieldName, maxCount);
};
