/**
 * Parses, calls the service, shapes the answer.
 */
import { unlink } from 'node:fs/promises';

import type { Request, Response } from 'express';

import {
  createPastedSourceSchema,
  notebookIdParamSchema,
  toSourceResponse,
} from '../dto/source.dto.js';
import { UnsupportedSourceError } from '../internal/errors.js';
import type { SourcesService } from '../services/sources.service.js';

export type SessionIdReader = (req: Request) => string | null;

/** Content type to source kind. Anything not in here is refused (M7-T3 checks the bytes). */
const KIND_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export class SourcesController {
  constructor(
    private readonly service: SourcesService,
    private readonly sessionIdOf: SessionIdReader
  ) {}

  private requireSession(req: Request): string {
    const sessionId = this.sessionIdOf(req);
    if (!sessionId) {
      // Same shape as the notebooks module's error, declared locally rather
      // than imported: modules do not import each other.
      throw Object.assign(new Error('No session. Enable cookies and reload.'), {
        statusCode: 400,
        errorCode: 'NO_SESSION',
      });
    }
    return sessionId;
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId } = notebookIdParamSchema.parse(req.params);

    const file = req.file;
    if (file) {
      // Multer has already written the bytes to disk by the time this runs.
      // Every path that does not hand them to a source row has to remove them
      // again: a refused upload that stays on the volume is 20 MB of nothing,
      // nobody owns it, no row points at it, and the cleanup job in M7-T5 walks
      // notebooks and would never see it. Repeat that in a loop and the disk of
      // a server with neighbours fills up.
      let kept = false;
      try {
        const kind = KIND_BY_MIME[file.mimetype];
        if (!kind) {
          throw new UnsupportedSourceError(
            `Quellwerk reads PDF, Word, plain text and Markdown. That file is ${file.mimetype}.`
          );
        }

        const source = await this.service.addUploaded(notebookId, sessionId, {
          // The file name is user data and goes in as it came, minus the
          // extension. What it must not do is arrive empty.
          title: fileTitle(file.originalname),
          kind,
          originalName: file.originalname,
          mime: file.mimetype,
          storagePath: file.path,
        });

        kept = true;
        res.status(201).json(toSourceResponse(source));
        return;
      } finally {
        if (!kept) await discard(file.path);
      }
    }

    const input = createPastedSourceSchema.parse(req.body ?? {});
    const source = await this.service.addPasted(notebookId, sessionId, input);
    res.status(201).json(toSourceResponse(source));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.requireSession(req);
    const { notebookId } = notebookIdParamSchema.parse(req.params);

    const sources = await this.service.list(notebookId, sessionId);
    res.json({ sources: sources.map(toSourceResponse) });
  };
}

/**
 * Removes an upload nothing took ownership of. A failure here is logged by the
 * caller's error path and must not replace the error the user actually gets:
 * "the notebook is full" is more useful than "unlink failed".
 */
async function discard(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Already gone, or never written. Either way there is nothing to clean up.
  }
}

/** "Bericht Q2.pdf" becomes "Bericht Q2"; a name that is only an extension stays whole. */
function fileTitle(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const title = (withoutExtension || originalName).trim();
  return title.length > 0 ? title.slice(0, 200) : 'Untitled source';
}
