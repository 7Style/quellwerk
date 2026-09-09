/**
 * SMTP Provider Utilities
 * Helper functions for SMTP-specific operations
 */

import { MailAttachment } from '../provider.interface.js';

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format email address with name
 */
export function formatEmailAddress(email: string, name?: string): string {
  if (!name) {
    return email;
  }
  // Escape quotes in name
  const escapedName = name.replace(/"/g, '\\"');
  return `"${escapedName}" <${email}>`;
}

/**
 * Convert attachment size to human readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Validate attachment size (default max: 10MB)
 */
export function validateAttachmentSize(attachment: MailAttachment, maxSizeBytes: number = 10 * 1024 * 1024): boolean {
  if (!attachment.content) {
    return true; // Path-based attachments are not validated here
  }
  
  const size = Buffer.isBuffer(attachment.content) 
    ? attachment.content.length 
    : Buffer.from(attachment.content).length;
    
  return size <= maxSizeBytes;
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'txt': 'text/plain',
    'zip': 'application/zip',
    'csv': 'text/csv',
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
}
