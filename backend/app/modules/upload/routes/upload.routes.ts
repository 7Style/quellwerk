import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import fs from 'node:fs/promises';
import { UploadController } from '../controllers/upload.controller.js';
import { uploadSingle, uploadMultiple } from '../configs/multer.config.js';
import { detectMimeTypeFromFile, isAllowedDetectedMimeType } from '../utils/file-validation.util.js';
import { FILE_UPLOAD_CONFIG } from '../types/file-types.js';
import { createRateLimiter } from '../../../common/middleware/rate-limit.middleware.js';
import { rateLimitConfig } from '../../../config/rate-limit.config.js';

/**
 * Magic-byte check for every uploaded file. Files whose content does not match
 * an allowed type are deleted again and the request is rejected with 400.
 */
async function verifyUploadedFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);

  const rejected: string[] = [];
  for (const file of files) {
    const detected = await detectMimeTypeFromFile(file.path);
    if (!isAllowedDetectedMimeType(detected, FILE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES)) {
      rejected.push(file.originalname);
    }
  }

  if (rejected.length > 0) {
    await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => undefined)));
    res.status(400).json({
      success: false,
      message: `File content does not match an allowed type: ${rejected.join(', ')}`,
    });
    return;
  }

  next();
}

/**
 * Create upload routes. Authentication is mandatory for every route.
 */
export function createUploadRoutes(uploadController: UploadController, requireAuth: RequestHandler): Router {
  const router = Router();
  const uploadLimiter = createRateLimiter('upload', rateLimitConfig.upload);

  // All upload routes require an authenticated user
  router.use(requireAuth);

  // Upload single file
  // POST /api/upload/single
  router.post('/single', uploadLimiter, uploadSingle('file'), verifyUploadedFiles, (req, res, next) =>
    uploadController.uploadSingle(req, res, next)
  );

  // Upload multiple files
  // POST /api/upload/multiple
  router.post(
    '/multiple',
    uploadLimiter,
    uploadMultiple('files', FILE_UPLOAD_CONFIG.MAX_FILES),
    verifyUploadedFiles,
    (req, res, next) => uploadController.uploadMultiple(req, res, next)
  );

  // Get/Download file
  // GET /api/upload/:fileId
  router.get('/:fileId', (req, res, next) => uploadController.getFile(req, res, next));

  // Delete file
  // DELETE /api/upload/:fileId
  router.delete('/:fileId', (req, res, next) => uploadController.deleteFile(req, res, next));

  return router;
}
