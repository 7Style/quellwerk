export { SourcesPanel } from './components/SourcesPanel';
export type { SourcesPanelProps } from './components/SourcesPanel';
export { SourceItem } from './components/SourceItem';
export { AddSourcesDialog } from './components/AddSourcesDialog';
export { SourceViewer } from './components/SourceViewer';
export type { SourceViewerProps, ViewerSource } from './components/SourceViewer';
export { SourcePassage } from './components/SourcePassage';
export { useSourceViewer } from './hooks/useSourceViewer';
export type { UseSourceViewerResult, ViewerTarget } from './hooks/useSourceViewer';
export { sourceFixtures } from './fixtures/sources';
export { sourceTextFixtures } from './fixtures/source-texts';
export { isUsable, INGEST_STEPS, SOURCE_KINDS } from './types/source';
export type {
  IngestStep,
  SourceKind,
  SourcesState,
  SourceStatus,
  SourceSummary,
} from './types/source';
