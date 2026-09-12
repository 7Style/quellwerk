import { createHash } from 'node:crypto';

/**
 * The five report formats (docs/SPEC.md, "UI-Vokabular").
 *
 * A format is a label, a prompt file and whether it needs the reader to say
 * something. Nothing else: the shape of each report lives in its prompt file,
 * where a reviewer can read it, and not as a structure somebody assembled in
 * TypeScript.
 */
export const REPORT_FORMATS = ['briefing', 'study-guide', 'faq', 'timeline', 'custom'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface FormatSpec {
  /** The English label the interface shows (docs/SPEC.md). */
  label: string;
  /** The structure block, rendered raw into report-common.md. */
  prompt: `report-${ReportFormat}`;
  /**
   * Whether a focus is required rather than optional.
   *
   * Only "Create your own" is: without a description there is no report to
   * write, and asking the model to invent one would be the opposite of a format
   * the reader chose.
   */
  needsFocus: boolean;
}

export const FORMATS: Record<ReportFormat, FormatSpec> = {
  briefing: { label: 'Briefing Doc', prompt: 'report-briefing', needsFocus: false },
  'study-guide': { label: 'Study Guide', prompt: 'report-study-guide', needsFocus: false },
  faq: { label: 'FAQ', prompt: 'report-faq', needsFocus: false },
  timeline: { label: 'Timeline', prompt: 'report-timeline', needsFocus: false },
  custom: { label: 'Create your own', prompt: 'report-custom', needsFocus: true },
};

/**
 * The key that makes a report idempotent.
 *
 * (notebook, type, params) as CLAUDE.md requires, with the focus in it: the same
 * format asked for twice is the same report, but the same format with a
 * different focus is a different one. Normalised so that trailing whitespace
 * does not buy a second run of a 150,000 token request.
 */
export function reportKey(format: ReportFormat, focus: string): string {
  const trimmed = focus.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? `${format}.${hash(trimmed)}` : format;
}

/**
 * Short, stable, and not meant to be reversed; it only has to differ.
 *
 * Sixty-four bits of SHA-256 rather than a 32-bit FNV: a collision does not
 * produce a wrong key, it hands the reader somebody's other report of this
 * notebook under a description they did not write. Within one notebook that is
 * improbable either way, and the wider hash costs nothing.
 */
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}
