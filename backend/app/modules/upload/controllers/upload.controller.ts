import type { NextFunction, Request, Response } from 'express';
import { UploadService } from '../services/upload.service.js';
import {
  FileResponseDto,
  MultipleFilesResponseDto,
  DeleteFileResponseDto,
} from '../dto/upload.dto.js';
import { sanitizeFilename } from '../utils/file-validation.util.js';

/**
 * Upload controller
 * Handles HTTP requests for file upload operations
 */
export class UploadController {
  constructor(private uploadService: UploadService) {}

  /**
   * Upload single file
   * POST /api/upload/single
   */
  async uploadSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'No file provided',
        });
        return;
      }

      const result = await this.uploadService.uploadSingle(req.file, req.user?.id);
      const response = new FileResponseDto(result);

      res.status(201).json({
        success: true,
        data: response,
        message: 'File uploaded successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload multiple files
   * POST /api/upload/multiple
   */
  async uploadMultiple(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No files provided',
        });
        return;
      }

      const results = await this.uploadService.uploadMultiple(req.files, req.user?.id);

      const filesResponse = results.map((result) => new FileResponseDto(result));
      const response = new MultipleFilesResponseDto(filesResponse);

      res.status(201).json({
        success: true,
        data: response,
        message: `${results.length} file(s) uploaded successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get/Download file (authenticated)
   * GET /api/upload/:fileId
   */
  async getFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = await this.uploadService.getFile(String(req.params.fileId));

      // Uploads are embedded by the frontend on another origin
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', file.mimetype);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${sanitizeFilename(file.filename)}"`);
      res.send(file.buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete file
   * DELETE /api/upload/:fileId
   */
  async deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await this.uploadService.deleteFile(String(req.params.fileId), req.user?.id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: 'File not found or could not be deleted',
        });
        return;
      }

      const response = new DeleteFileResponseDto(true, 'File deleted successfully');

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }
}
