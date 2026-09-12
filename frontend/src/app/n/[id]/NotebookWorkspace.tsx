'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { highlightOf } from '@/lib/citation';
import { relativeTime } from '@/lib/relative-time';
import { Composer, Thread, useChatStream, useListMessagesQuery } from '@/modules/chat';
import { OverviewHeader, useGetNotebookQuery } from '@/modules/notebooks';
import { Topbar, Workspace } from '@/modules/shell';
import {
  FlashcardsView,
  MindMapView,
  NoteView,
  ReportView,
  StudioPanel,
  isWriting,
  REPORT_STUCK_AFTER_MS,
  useAddNoteMutation,
  useConvertNoteToSourceMutation,
  useDeleteNoteMutation,
  useListNotesQuery,
  useFlashcardsQuery,
  useMindMapQuery,
  useRequestFlashcardsMutation,
  useRequestMindMapMutation,
  isWritingCards,
  WHILE_WRITING_CARDS_MS,
  useSaveAnswerToNoteMutation,
  isDrawing,
  WHILE_DRAWING_MS,
  useListReportsQuery,
  useReportQuery,
  useRequestReportMutation,
  useRetryReportMutation,
  WHILE_WRITING_MS,
} from '@/modules/studio';
import {
  SourcesPanel,
  SourceViewer,
  useAddPastedSourceMutation,
  useListSourcesQuery,
  useSourceTextQuery,
  useSourceViewer,
  useUploadSourceMutation,
  STUCK_AFTER_MS,
  WHILE_READING_MS,
} from '@/modules/sources';

export interface NotebookWorkspaceProps {
  notebookId: string;
}

/**
 * A notebook, with everything it shows fetched in the browser.
 *
 * Every read is scoped to the anonymous session in the cookie (ADR-0005), so
 * the data cannot be fetched while the page is rendered on the server without
 * forwarding that cookie over a second address for the API. One way to reach
 * the backend is enough, and this is it.
 *
 * The state that two columns share lives here: which source is open and what is
 * marked in it. A chip in the chat opens a source at a passage, a row in the
 * list opens it at the top, and both end in the same viewer. Sources and chat
 * are separate modules that may not import each other, so the route knows about
 * both and neither knows about the other.
 */
export function NotebookWorkspace({ notebookId }: NotebookWorkspaceProps) {
  const router = useRouter();

  /**
   * Der Wechsel in die Kopie, nachdem im Demo-Notizbuch geschrieben wurde.
   *
   * Der Server entscheidet das, nicht die Oberfläche: das Demo-Notizbuch gehört
   * keiner Sitzung, also legt der erste Schreibzugriff eine Kopie an und
   * antwortet mit deren Id (Copy-on-first-write, M7-T1). Hier wird nur
   * verglichen und gewechselt -- ohne das stünde die neue Quelle in einem
   * Notizbuch, das der Leser nicht offen hat.
   *
   * `replace` und nicht `push`: der Zurück-Knopf soll nicht auf die Adresse
   * führen, in der der Schreibzugriff gerade nicht gelandet ist.
   */
  function followCopy(target: string | undefined): void {
    // Ohne Id wird nicht gewechselt. Eine Antwort ohne `notebookId` kommt von
    // einem Server, der aelter ist als dieses Feld, und `/n/undefined` waere
    // schlimmer als ein Wechsel, der ausbleibt.
    if (target && target !== notebookId) router.replace(`/n/${target}`);
  }

  const notebook = useGetNotebookQuery(notebookId);
  const sources = useListSourcesQuery(notebookId);
  const history = useListMessagesQuery(notebookId);

  const rows = useMemo(() => sources.data ?? [], [sources.data]);
  const ready = useMemo(() => rows.filter((source) => source.status === 'ready'), [rows]);

  // A source that has been queued longer than the worker could plausibly need
  // is stuck, not slow. The panel stops asking then and says so; polling on
  // would be a request every two seconds for as long as the tab is open, under
  // a line that never changes.
  //
  // The clock is state and not a `Date.now()` in the body: reading it while
  // rendering makes the render depend on when it happened, and two renders in
  // the same second would disagree. The interval runs only while something is
  // queued, and 0 before the first tick simply means "not yet stuck".
  const queued = rows.some((source) => source.status === 'queued');

  const reports = useListReportsQuery(notebookId);
  const reportRows = useMemo(() => reports.data ?? [], [reports.data]);
  const beingWritten = reportRows.some(isWriting);

  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!queued && !beingWritten) return;
    // Only the interval. Setting the clock straight away would be a state write
    // inside the effect body, and the first tick is two seconds away against a
    // three minute threshold.
    const tick = setInterval(() => setNow(Date.now()), WHILE_READING_MS);
    return () => clearInterval(tick);
  }, [queued, beingWritten]);

  const stuck = rows.filter(
    (source) => source.status === 'queued' && now - Date.parse(source.createdAt) > STUCK_AFTER_MS
  );
  const working = queued && stuck.length === 0;

  // Ingest runs in the worker and the list does not push, so while a document
  // is being read the panel asks again.
  useListSourcesQuery(notebookId, {
    pollingInterval: working ? WHILE_READING_MS : 0,
    skip: !working,
  });

  const viewer = useSourceViewer();
  const openId = viewer.target?.sourceId ?? null;
  const openSource = openId ? rows.find((source) => source.id === openId) : undefined;

  const text = useSourceTextQuery(
    { notebookId, sourceId: openId ?? '' },
    { skip: openId === null }
  );

  const chat = useChatStream({ notebookId, initial: history.data });

  // Same rule as a source that never got read: a row still being written long
  // after a report could plausibly take is stuck, and the panel stops asking
  // rather than shimmering under a line that never changes.
  const stuckReports = reportRows
    .filter((report) => isWriting(report) && now - Date.parse(report.createdAt) > REPORT_STUCK_AFTER_MS)
    .map((report) => report.id);

  // A report takes about half a minute and nothing pushes, so the panel asks
  // again while one is being written and stops the moment none is.
  const writing = beingWritten && stuckReports.length === 0;
  useListReportsQuery(notebookId, {
    pollingInterval: writing ? WHILE_WRITING_MS : 0,
    skip: !writing,
  });

  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const report = useReportQuery(
    { notebookId, reportId: openReportId ?? '' },
    { skip: openReportId === null }
  );

  const [requestReport] = useRequestReportMutation();
  const [retryReport] = useRetryReportMutation();

  const notes = useListNotesQuery(notebookId);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const openNote = (notes.data ?? []).find((note) => note.id === openNoteId) ?? null;
  const [addNote] = useAddNoteMutation();
  const [saveAnswerToNote] = useSaveAnswerToNoteMutation();
  const [convertNote] = useConvertNoteToSourceMutation();
  const [deleteNote] = useDeleteNoteMutation();

  const mindMap = useMindMapQuery(notebookId);
  const [requestMindMap] = useRequestMindMapMutation();
  const [mindMapOpen, setMindMapOpen] = useState(false);

  // Wie bei einem Report: nichts schiebt, also wird nachgefragt, solange
  // gezeichnet wird, und in dem Moment nicht mehr, in dem es fertig ist.
  const drawing = isDrawing(mindMap.data ?? null);
  useMindMapQuery(notebookId, {
    pollingInterval: drawing ? WHILE_DRAWING_MS : 0,
    skip: !drawing,
  });

  const flashcards = useFlashcardsQuery(notebookId);
  const [requestFlashcards] = useRequestFlashcardsMutation();
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);

  const writingCards = isWritingCards(flashcards.data ?? null);
  useFlashcardsQuery(notebookId, {
    pollingInterval: writingCards ? WHILE_WRITING_CARDS_MS : 0,
    skip: !writingCards,
  });

  // One box, filled from three places: the reader typing, a follow-up of the
  // last turn, and a suggested question from the overview.
  const [question, setQuestion] = useState('');

  const [addPaste] = useAddPastedSourceMutation();
  const [uploadSource] = useUploadSourceMutation();

  // The tab, once the notebook has arrived. Metadata is built on the server and
  // a notebook is only readable with the session cookie, so the name cannot be
  // there; a reader with six tabs open still needs to tell them apart.
  const title = notebook.data?.title;
  useEffect(() => {
    if (title) document.title = `${title} - Quellwerk`;
  }, [title]);

  if (notebook.isError) {
    return <MissingNotebook />;
  }

  return (
    <div className="flex h-dvh flex-col">
      <Topbar meta={notebook.data ? `Saved ${relativeTime(notebook.data.updatedAt)}` : undefined}>
        {notebook.data ? (
          <>
            <span className="h-[20px] w-px flex-none bg-rule" aria-hidden="true" />
            <span className="text-base leading-none" aria-hidden="true">
              {notebook.data.emoji}
            </span>
            {/* Not a heading. The overview below carries the h1; repeating it
                here would make a reader navigating by heading hear the same
                title twice, once as chrome. This copy exists for after the
                overview has scrolled away. */}
            <span className="truncate text-ui-lg font-medium">{notebook.data.title}</span>
          </>
        ) : null}
      </Topbar>

      <Workspace
        sourceCount={rows.length}
        sourcesFill
        sources={
          viewer.target ? (
            <SourceViewer
              source={
                text.data
                  ? text.data
                  : openSource
                    ? { id: openSource.id, title: openSource.title, text: '' }
                    : null
              }
              highlight={viewer.target.highlight}
              onClose={viewer.close}
              loading={text.isFetching}
              error={text.isError ? 'The document could not be loaded.' : null}
              onRetry={() => void text.refetch()}
            />
          ) : (
            <SourcesPanel
              sources={rows}
              state={sources.isLoading ? 'loading' : sources.isError ? 'error' : 'ready'}
              stuck={stuck.length}
              onRecheck={() => void sources.refetch()}
              onOpen={(id) => viewer.open(id)}
              currentSourceId={openId ?? undefined}
              onRetry={() => void sources.refetch()}
              // `unwrap` on purpose: without it RTK Query resolves with an
              // `{ error }` object and a refusal from the server looks exactly
              // like a success to the caller.
              onAddPaste={(input) =>
                addPaste({ notebookId, ...input })
                  .unwrap()
                  .then((source) => {
                    followCopy(source.notebookId);
                  })
              }
              onAddFiles={async (files) => {
                // One after another, so the first refusal is the one shown and
                // the rest are not queued behind a full notebook.
                for (const file of files) {
                  const source = await uploadSource({ notebookId, file }).unwrap();
                  followCopy(source.notebookId);
                }
              }}
            />
          )
        }
        chat={
          openReportId ? (
            <ReportView
              report={report.data ?? null}
              loading={report.isFetching}
              error={report.isError ? 'The report could not be loaded.' : null}
              onClose={() => setOpenReportId(null)}
              onOpenCitation={(citation) => viewer.open(citation.sourceId, highlightOf(citation))}
            />
          ) : flashcardsOpen ? (
            <FlashcardsView
              deck={flashcards.data ?? null}
              loading={flashcards.isLoading}
              onClose={() => setFlashcardsOpen(false)}
              onOpenCitation={(citation) => viewer.open(citation.sourceId, highlightOf(citation))}
              onRebuild={async () => {
                await requestFlashcards(notebookId).unwrap();
              }}
            />
          ) : mindMapOpen ? (
            <MindMapView
              map={mindMap.data ?? null}
              loading={mindMap.isLoading}
              onClose={() => setMindMapOpen(false)}
              onAsk={(text) => {
                // Ins Eingabefeld, nicht abgeschickt: der Leser darf die Frage
                // noch enger stellen. Dafuer muss die Karte aus der Spalte.
                setQuestion(text);
                setMindMapOpen(false);
              }}
              onRebuild={async () => {
                await requestMindMap(notebookId).unwrap();
              }}
            />
          ) : openNoteId ? (
            <NoteView
              note={openNote}
              loading={notes.isLoading}
              onClose={() => setOpenNoteId(null)}
              onOpenCitation={(citation) => viewer.open(citation.sourceId, highlightOf(citation))}
              onConvert={async () => {
                const source = await convertNote({ notebookId, noteId: openNoteId }).unwrap();
                // Die Notiz bleibt offen: was passiert ist, steht links in der
                // Quellenliste, und ein Sprung waere eine Antwort auf eine
                // Frage, die niemand gestellt hat.
                followCopy(source.notebookId);
              }}
              onDelete={async () => {
                await deleteNote({ notebookId, noteId: openNoteId }).unwrap();
                setOpenNoteId(null);
              }}
            />
          ) : (
            <Thread
              header={
                notebook.data ? (
                  <OverviewHeader
                    notebook={{ ...notebook.data, sourceCount: rows.length }}
                    onAsk={setQuestion}
                  />
                ) : null
              }
              messages={chat.messages}
              state={chat.state}
              sourceCount={ready.length}
              onOpenCitation={(citation) => viewer.open(citation.sourceId, highlightOf(citation))}
              onSaveToNote={async (messageId) => {
                // Der Titel kommt aus der Frage davor, nicht aus einem Dialog:
                // eine Antwort sichert man mit einem Klick, und umbenennen kann
                // man sie danach immer noch.
                const note = await saveAnswerToNote({
                  notebookId,
                  messageId,
                  title: titleForNote(chat.messages, messageId),
                }).unwrap();
                followCopy(note.notebookId);
                setOpenNoteId(note.id);
              }}
              error={chat.error}
              onRetry={chat.retryable ? chat.dismissError : undefined}
            />
          )
        }
        composer={
          // The composer belongs to the conversation. A report has taken the
          // column; the way back is the chevron at its top.
          openReportId || openNoteId || mindMapOpen || flashcardsOpen ? null : (
            <Composer
              value={question}
              onValueChange={setQuestion}
              suggestions={chat.suggestions}
              busy={chat.busy}
              onAsk={chat.ask}
              onStop={chat.stop}
              meta={
                rows.length === 1
                  ? `${ready.length} of 1 source ready`
                  : `${ready.length} of ${rows.length} sources ready`
              }
            />
          )
        }
        studio={
          <StudioPanel
            reports={reports.data ?? []}
            loading={reports.isLoading}
            hasSources={ready.length > 0}
            openReportId={openReportId ?? undefined}
            stuck={stuckReports}
            onRequest={(input) =>
              requestReport({ notebookId, ...input })
                .unwrap()
                .then((report) => {
                  // Ein Report im Demo-Notizbuch entsteht in der Kopie, und der
                  // Leser soll dort zusehen, wie er geschrieben wird.
                  followCopy(report.notebookId);
                })
            }
            flashcards={flashcards.data ?? null}
            flashcardsOpen={flashcardsOpen}
            onOpenFlashcards={async () => {
              setOpenReportId(null);
              setOpenNoteId(null);
              setMindMapOpen(false);
              setFlashcardsOpen(true);
              if (!flashcards.data) {
                const created = await requestFlashcards(notebookId).unwrap();
                followCopy(created.notebookId);
              }
            }}
            mindMap={mindMap.data ?? null}
            mindMapOpen={mindMapOpen}
            onOpenMindMap={async () => {
              setOpenReportId(null);
              setOpenNoteId(null);
              setFlashcardsOpen(false);
              setMindMapOpen(true);
              // Noch keine Karte: bestellen, und die Ansicht zeigt beim
              // Zeichnen zu. Eine vorhandene wird nur geoeffnet - neu
              // geschrieben wird sie ueber "Build again", nicht nebenbei.
              if (!mindMap.data) {
                const created = await requestMindMap(notebookId).unwrap();
                followCopy(created.notebookId);
              }
            }}
            notes={notes.data ?? []}
            notesLoading={notes.isLoading}
            onAddNote={async (input) => {
              try {
                const note = await addNote({ notebookId, ...input }).unwrap();
                followCopy(note.notebookId);
                return true;
              } catch {
                return false;
              }
            }}
            onOpenNote={(noteId) => {
              setOpenReportId(null);
              setMindMapOpen(false);
              setFlashcardsOpen(false);
              setOpenNoteId(noteId);
            }}
            openNoteId={openNoteId ?? undefined}
            onOpen={(reportId) => {
              setOpenNoteId(null);
              setMindMapOpen(false);
              setFlashcardsOpen(false);
              setOpenReportId(reportId);
            }}
            onRetry={(reportId) =>
              retryReport({ notebookId, reportId })
                .unwrap()
                .then(() => undefined)
            }
          />
        }
      />
    </div>
  );
}

/**
 * A notebook of another session does not exist as far as this session is
 * concerned (SECURITY.md 7.2), and neither does one that was never created. The
 * screen says the same thing for both, because telling them apart would be the
 * information the rule exists to withhold.
 */
/**
 * Der Titel einer gesicherten Antwort: die Frage, die zu ihr gefuehrt hat.
 *
 * Eine Antwort ohne ihre Frage ist eine Notiz, die niemand wiederfindet. Faellt
 * die Frage weg - im Verlauf steht sie immer davor, im Stream auch -, bleibt
 * ein Datum, und das ist immer noch besser als die ersten Woerter der Antwort.
 */
function titleForNote(messages: readonly { id: string; role: string }[], messageId: string): string {
  const at = messages.findIndex((message) => message.id === messageId);
  for (let index = at - 1; index >= 0; index -= 1) {
    const earlier = messages[index];
    if (earlier.role === 'user') {
      const text = (earlier as { text?: string }).text ?? '';
      return text.length > 120 ? `${text.slice(0, 117)}...` : text;
    }
  }
  return 'Saved answer';
}

function MissingNotebook() {
  return (
    <div className="flex h-dvh flex-col">
      <Topbar />
      <main className="grid flex-1 place-items-center px-5" data-testid="notebook-missing">
        <div className="grid max-w-[46ch] justify-items-center gap-3 text-center">
          <h1 className="m-0 text-h2 font-semibold">This notebook is not here.</h1>
          <p className="m-0 text-ink-muted">
            It may belong to another browser, or it may never have existed. Notebooks live in the
            browser that made them; there is no account to sign in to.
          </p>
          <Button variant="outline" asChild>
            <Link href="/">
              <Icon name="chevronLeft" />
              Back to your notebooks
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
