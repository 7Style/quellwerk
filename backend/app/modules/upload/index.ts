/**
 * Upload Module
 * 
 * This module provides file upload functionality with support for:
 * - Local storage (Multer)
 * - Future cloud storage (AWS S3, Google Cloud Storage, etc.)
 * 
 * The module uses an interface-based architecture that allows easy switching
 * between different storage implementations without changing routes or controllers.
 */

export * from './upload.module.js';
export * from './controllers/upload.controller.js';
export * from './services/upload.service.js';
export * from './services/multer-storage.service.js';
export * from './interfaces/file-storage.interface.js';
export * from './types/file-types.js';
export * from './dto/upload.dto.js';
export * from './configs/multer.config.js';
export * from './utils/file-validation.util.js';
