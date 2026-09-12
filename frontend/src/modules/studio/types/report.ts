import type { Citation } from '@/lib/citation';

/** The five formats, in the order the panel offers them (docs/SPEC.md). */
export const REPORT_FORMATS = ['briefing', 'study-guide', 'faq', 'timeline', 'custom'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const FORMAT_LABELS: Record<ReportFormat, string> = {
  briefing: 'Briefing Doc',
  'study-guide': 'Study Guide',
  faq: 'FAQ',
  timeline: 'Timeline',
  custom: 'Create your own',
};

/** What each one is for, under its name in the panel. */
export const FORMAT_BLURBS: Record<ReportFormat, string> = {
  briefing: 'What to know before a meeting about these sources.',
  'study-guide': 'Terms, material and questions to test yourself.',
  faq: 'The questions a reader of these documents would ask.',
  timeline: 'Every date the documents name, in order.',
  custom: 'Describe the report you want.',
};

/** `queued` and `running` both mean "being written"; the panel says which. */
export type ReportStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface ReportSummary {
  id: string;
  format: ReportFormat;
  focus: string;
  title: string | null;
  status: ReportStatus;
  /** One sentence, already safe to show. Never an upstream message. */
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ReportBody extends ReportSummary {
  segments: Array<{ text: string; citations: Citation[] }>;
  /** The rendered prompt, for "View prompt used" (docs/SPEC.md). */
  promptUsed: string | null;
}

export function isWriting(report: ReportSummary): boolean {
  return report.status === 'queued' || report.status === 'running';
}
