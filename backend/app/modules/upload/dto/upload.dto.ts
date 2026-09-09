/**
 * Upload DTOs
 */

/**
 * DTO for file upload request
 */
export interface UploadFileDto {
  folder?: string;
  allowedMimeTypes?: string[];
}

/**
 * DTO for file response
 */
export class FileResponseDto {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedAt: Date;

  constructor(data: {
    id: string;
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    url: string;
    uploadedAt: Date;
  }) {
    this.id = data.id;
    this.filename = data.filename;
    this.originalName = data.originalName;
    this.mimetype = data.mimetype;
    this.size = data.size;
    this.url = data.url;
    this.uploadedAt = data.uploadedAt;
  }
}

/**
 * DTO for multiple files response
 */
export class MultipleFilesResponseDto {
  files: FileResponseDto[];
  count: number;

  constructor(files: FileResponseDto[]) {
    this.files = files;
    this.count = files.length;
  }
}

/**
 * DTO for file deletion request
 */
export interface DeleteFileDto {
  fileId: string;
}

/**
 * DTO for successful deletion response
 */
export class DeleteFileResponseDto {
  success: boolean;
  message: string;

  constructor(success: boolean, message: string) {
    this.success = success;
    this.message = message;
  }
}
