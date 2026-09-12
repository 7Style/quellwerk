'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { NotebookGrid } from '../components/NotebookGrid';
import { useCreateNotebookMutation, useListNotebooksQuery } from '../services/notebooks.api';
import type { NotebooksState } from '../types/notebook';

/**
 * Everything below the topbar on `/`.
 *
 * The sentence under the title is the product's claim, which is why it sits on
 * the first screen and not in an About box: every sentence of an answer carries
 * the passage it came from.
 *
 * The notebooks are fetched here rather than on the server. Every read is
 * scoped to an anonymous session (ADR-0005) and the session lives in the
 * browser's cookie, so server rendering would mean forwarding that cookie from
 * the frontend container to the backend over an address only the container
 * knows. That is a second way to reach the API, and one way is enough.
 */
export function HomePage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useListNotebooksQuery();
  const [createNotebook, creating] = useCreateNotebookMutation();

  const state: NotebooksState = isLoading ? 'loading' : isError ? 'error' : 'ready';

  async function create() {
    // The id comes from the server. Routing to a notebook before it exists is
    // how a reader lands on a page that 404s a moment later.
    const notebook = await createNotebook().unwrap();
    router.push(`/n/${notebook.id}`);
  }

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-8">
      <div className="mb-7 flex items-end justify-between gap-5">
        <div>
          <h1 className="mb-2 text-display leading-tight font-semibold tracking-[-0.015em]">
            Your notebooks
          </h1>
          <p className="m-0 max-w-[54ch] font-read text-read leading-read text-ink-muted">
            Ask questions about documents you added yourself. Every sentence in an answer carries
            the passage it came from, and you can open that passage in one click.
          </p>
        </div>
        <Button size="lg" type="button" onClick={() => void create()} disabled={creating.isLoading}>
          <Icon name="plus" />
          Create new notebook
        </Button>
      </div>

      <NotebookGrid
        notebooks={data ?? []}
        state={state}
        onCreate={() => void create()}
        onRetry={() => void refetch()}
      />
    </div>
  );
}
