/**
 * Reports, always scoped to the session that asked.
 *
 * Asking for a report is a write: it spends money and puts a row in the
 * notebook, so it goes through `writable` and the demo notebook refuses it
 * until copy-on-first-write exists (M7-T1). Reading one is a read.
 */
import { FORMATS, reportKey, type ReportFormat } from '../internal/formats.js';
import type {
  ArtifactRow,
  ArtifactWithBody,
  NotebookAccess,
  StudioRepository,
} from '../interfaces/studio.repository.js';

export interface StudioServiceDeps {
  repository: StudioRepository;
  notebooks: NotebookAccess;
  /** Refuses once the daily budget is spent (SECURITY.md 7.3). */
  assertBudgetLeft: () => Promise<void>;
  /**
   * Puts the job on the artifact queue. The API never waits for it.
   *
   * `replace` is what makes "Try again" work: the failed job is still filed
   * under its id, and BullMQ drops an add that collides with one.
   */
  enqueueReport: (job: {
    artifactId: string;
    notebookId: string;
    replace?: boolean;
  }) => Promise<void>;
}

export class StudioService {
  constructor(private readonly deps: StudioServiceDeps) {}

  async list(notebookId: string, sessionId: string): Promise<ArtifactRow[]> {
    await this.deps.notebooks.readable(notebookId, sessionId);
    return this.deps.repository.listByNotebook(notebookId);
  }

  async get(notebookId: string, artifactId: string, sessionId: string): Promise<ArtifactWithBody> {
    await this.deps.notebooks.readable(notebookId, sessionId);

    const artifact = await this.deps.repository.findById(notebookId, artifactId);
    if (!artifact) {
      throw Object.assign(new Error('No such report.'), {
        statusCode: 404,
        errorCode: 'REPORT_NOT_FOUND',
      });
    }
    return artifact;
  }

  /**
   * Asks for a report, or hands back the one already asked for.
   *
   * Two clicks on Briefing Doc are one report. The key is (format, focus), so
   * the same format with a different focus is a different report - and the
   * enqueue only happens for a row that was actually created, because a second
   * job for a finished report would be a second 150,000 token request for a
   * page that already exists.
   */
  async request(
    notebookId: string,
    sessionId: string,
    input: { format: ReportFormat; focus: string }
  ): Promise<{ artifact: ArtifactRow; created: boolean }> {
    await this.deps.notebooks.writable(notebookId, sessionId);

    if (FORMATS[input.format].needsFocus && input.focus.trim().length === 0) {
      throw Object.assign(new Error('Describe the report you want.'), {
        statusCode: 422,
        errorCode: 'FOCUS_REQUIRED',
      });
    }

    // Before the row, not after: a refused request must not leave a queued
    // report behind that nobody will ever run.
    await this.deps.assertBudgetLeft();

    const result = await this.deps.repository.createOrGet({
      notebookId,
      type: 'report',
      idempotencyKey: reportKey(input.format, input.focus),
      params: { format: input.format, focus: input.focus.trim() },
    });

    if (result.created) {
      await this.deps.enqueueReport({ artifactId: result.artifact.id, notebookId });
    }

    return result;
  }

  /**
   * Asks again for a report that failed.
   *
   * The row is reused rather than a second one created: the reader asked for
   * one Briefing Doc, and a list with three failed attempts of the same report
   * in it is a list nobody can read.
   */
  async retry(notebookId: string, artifactId: string, sessionId: string): Promise<ArtifactRow> {
    await this.deps.notebooks.writable(notebookId, sessionId);
    await this.deps.assertBudgetLeft();

    const artifact = await this.deps.repository.findById(notebookId, artifactId);
    if (!artifact) {
      throw Object.assign(new Error('No such report.'), {
        statusCode: 404,
        errorCode: 'REPORT_NOT_FOUND',
      });
    }
    if (artifact.status !== 'failed') {
      throw Object.assign(new Error('That report did not fail.'), {
        statusCode: 409,
        errorCode: 'REPORT_NOT_FAILED',
      });
    }

    await this.deps.repository.requeue(artifactId);
    await this.deps.enqueueReport({ artifactId, notebookId, replace: true });

    return { ...artifact, status: 'queued', error: null };
  }
}
