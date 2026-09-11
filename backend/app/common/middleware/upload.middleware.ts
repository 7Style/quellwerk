/**
 * The upload middleware, configured once for every module that takes a file.
 *
 * It lives in common/middleware and not inside the sources module on purpose.
 * The 20 MB limit is a product decision from docs/SPEC.md, and a limit each
 * module sets for itself is a limit that will drift from the one the
 * documentation names. Under app/modules it would also be a file that every
 * module is forbidden to import, which import/no-restricted-paths pointed out
 * the moment a test tried.
 *
 * What this does NOT do is decide whether a file is what it claims to be. The
 * declared content type is a claim by the client; checking it against the bytes
 * is M7-T3, and until then a wrong type ends as a failed source in the worker
 * rather than as a wrong answer.
 */
import multer from 'multer';
import type { RequestHandler } from 'express';

import { config } from '../../config/index.js';

/**
 * @param maxFileSize overrides the configured cap. Only the test uses it, and
 * only so the path from the limit to a 413 can be walked without pushing 20 MB
 * through a test run.
 */
export function createUploadMiddleware(maxFileSize: number = config.upload.maxFileSize): RequestHandler {
  const upload = multer({
    dest: config.upload.dir,
    limits: {
      fileSize: maxFileSize,
      // One file per request, and no other multipart fields to parse. Anything
      // else is refused by multer before it reaches a handler.
      files: 1,
    },
  });

  // `.single` accepts a request without a file too, which is what the pasted
  // path needs: one route, two kinds of source.
  return upload.single('file');
}
