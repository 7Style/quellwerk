import type { Metadata } from 'next';

import { APP_NAME } from '@/lib/app';
import { NotebookWorkspace } from './NotebookWorkspace';

interface NotebookRouteProps {
  /** A Promise since Next 15; awaited before anything reads it. */
  params: Promise<{ id: string }>;
}

/**
 * The title cannot name the notebook here.
 *
 * Metadata is built on the server and a notebook is readable only with the
 * session cookie, so putting the name in the tab would mean a second way for
 * the server to reach the API. The browser sets `document.title` once the
 * notebook has arrived instead (NotebookWorkspace).
 */
export const metadata: Metadata = { title: APP_NAME };

export default async function NotebookPage({ params }: NotebookRouteProps) {
  const { id } = await params;

  // key: ein Wechsel von /n/A nach /n/B haengt die Komponente neu ein. Ohne das
  // koennte der Verlauf von A unter der Adresse von B stehen bleiben.
  return <NotebookWorkspace key={id} notebookId={id} />;
}
