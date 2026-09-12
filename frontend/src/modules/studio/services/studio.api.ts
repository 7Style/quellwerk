import { baseApi } from '@/lib/api';
import type { ReportBody, ReportFormat, ReportSummary } from '../types/report';

/** A report being written is asked about again; nothing pushes. */
export const WHILE_WRITING_MS = 2_000;

export const studioApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listReports: build.query<ReportSummary[], string>({
      query: (notebookId) => `/api/notebooks/${notebookId}/reports`,
      transformResponse: (response: { reports: ReportSummary[] }) => response.reports,
      providesTags: (_result, _error, notebookId) => [{ type: 'Report' as const, id: notebookId }],
    }),

    report: build.query<ReportBody, { notebookId: string; reportId: string }>({
      query: ({ notebookId, reportId }) => `/api/notebooks/${notebookId}/reports/${reportId}`,
      transformResponse: (response: { report: ReportBody }) => response.report,
      providesTags: (_result, _error, { reportId }) => [{ type: 'Report' as const, id: reportId }],
    }),

    requestReport: build.mutation<
      ReportSummary,
      { notebookId: string; format: ReportFormat; focus?: string }
    >({
      query: ({ notebookId, format, focus }) => ({
        method: 'POST',
        url: `/api/notebooks/${notebookId}/reports`,
        body: { format, focus: focus ?? '' },
      }),
      transformResponse: (response: { report: ReportSummary }) => response.report,
      invalidatesTags: (_result, _error, { notebookId }) => [
        { type: 'Report' as const, id: notebookId },
      ],
    }),

    retryReport: build.mutation<ReportSummary, { notebookId: string; reportId: string }>({
      query: ({ notebookId, reportId }) => ({
        method: 'POST',
        url: `/api/notebooks/${notebookId}/reports/${reportId}/retry`,
      }),
      transformResponse: (response: { report: ReportSummary }) => response.report,
      invalidatesTags: (_result, _error, { notebookId, reportId }) => [
        { type: 'Report' as const, id: notebookId },
        { type: 'Report' as const, id: reportId },
      ],
    }),
  }),
});

export const {
  useListReportsQuery,
  useReportQuery,
  useRequestReportMutation,
  useRetryReportMutation,
} = studioApi;
