import type { RequestHandler, Router } from 'express';
import { MulterStorageService } from './services/multer-storage.service.js';
import { UploadService } from './services/upload.service.js';
import { UploadController } from './controllers/upload.controller.js';
import { createUploadRoutes } from './routes/upload.routes.js';
import { FILE_UPLOAD_CONFIG } from './types/file-types.js';

/**
 * Upload module configuration interface
 */
export interface IUploadModuleConfig {
  uploadDir?: string;
  baseUrl?: string;
  /** Auth middleware from the auth module -- mandatory, every upload route is protected */
  requireAuth: RequestHandler;
}

/**
 * Upload Module
 * Factory function to create and configure the upload module
 */
export class UploadModule {
  private storage: MulterStorageService;
  private service: UploadService;
  private controller: UploadController;
  public router: Router;

  constructor(config: IUploadModuleConfig) {
    // Initialize storage service (can be easily swapped with S3StorageService)
    this.storage = new MulterStorageService(
      config.uploadDir || FILE_UPLOAD_CONFIG.UPLOAD_DIR,
      config.baseUrl
    );

    // Initialize upload service
    this.service = new UploadService(this.storage);

    // Initialize controller
    this.controller = new UploadController(this.service);

    // Create routes
    this.router = createUploadRoutes(this.controller, config.requireAuth);
  }

  /**
   * Get the service instance (useful for testing or direct access)
   */
  getService(): UploadService {
    return this.service;
  }

  /**
   * Get the controller instance
   */
  getController(): UploadController {
    return this.controller;
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Factory function to create upload module
 */
export function createUploadModule(config: IUploadModuleConfig): UploadModule {
  return new UploadModule(config);
}
