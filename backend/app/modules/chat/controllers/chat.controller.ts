/**
 * The chat route. It answers with an event stream, which changes two things
 * about how failures work.
 *
 * The headers go out before the answer exists, so there is no status code left
 * to change once something breaks. A failure after that point is an `error`
 * event and a closed stream, never an exception that reaches the error
 * middleware; the middleware would try to write JSON into a response that is
 * already an event stream.
 *
 * And the client can leave at any moment. A closed tab aborts the upstream call
 * rather than paying for an answer nobody will read.
 */
import type { Request, Response } from 'express';

import { chatTurnSchema, notebookIdParamSchema } from '../dto/chat.dto.js';
import { claimTurn } from '../internal/concurrency.js';
import { sseFrom } from '../internal/stream.js';
import type { ChatService } from '../services/chat.service.js';

export type SessionIdReader = (req: Request) => string | null;

export class ChatController {
  constructor(
    private readonly service: ChatService,
    private readonly sessionIdOf: SessionIdReader
  ) {}

  ask = async (req: Request, res: Response): Promise<void> => {
    const sessionId = this.sessionIdOf(req);
    if (!sessionId) {
      throw Object.assign(new Error('No session. Enable cookies and reload.'), {
        statusCode: 400,
        errorCode: 'NO_SESSION',
      });
    }

    // Parsed before a single header goes out. A malformed question is a 400
    // with a JSON body, the way every other route answers; once the stream is
    // open that is no longer possible.
    const { notebookId } = notebookIdParamSchema.parse(req.params);
    const input = chatTurnSchema.parse(req.body ?? {});

    // Before the headers, so this is still a JSON refusal with a status code.
    // The hourly limiter cannot see a burst and the budget guard reads a total
    // that the running turns have not written yet (internal/concurrency.ts).
    const release = claimTurn(sessionId);
    if (!release) {
      throw Object.assign(new Error('One answer at a time. Wait for the current one to finish.'), {
        statusCode: 429,
        errorCode: 'TOO_MANY_TURNS',
      });
    }

    const stream = sseFrom(res);
    const controller = new AbortController();

    // On the RESPONSE, not the request, and this cost a test to learn: Node
    // emits `close` on an IncomingMessage as soon as the request body has been
    // read, which for a POST is immediately. Listening there aborted every turn
    // before the first token and produced an empty stream every time.
    //
    // `close` on the response fires when the connection goes, whether the
    // client navigated away, lost the network or pressed stop. The check on
    // `writableEnded` separates the two cases that look identical from here: a
    // turn we finished ourselves, and a client that left in the middle. Only
    // the second one aborts the upstream call, which is what turns a closed tab
    // into "nothing more is billed".
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
      stream.close();
      // Here as well as in the `finally`. A client that leaves mid-turn never
      // reaches the end of `run`, and a slot that is only freed there would
      // leak one per abandoned turn until the session cannot chat at all.
      release();
    });

    stream.open();

    try {
      await this.service.run(
        { notebookId, sessionId, ...input },
        stream,
        controller.signal
      );
    } finally {
      stream.close();
      release();
    }
  };
}
