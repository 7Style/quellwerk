import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { NotebookGrid } from '../components/NotebookGrid';
import type { NotebookSummary, NotebooksState } from '../types/notebook';

export interface HomePageProps {
  notebooks: NotebookSummary[];
  state?: NotebooksState;
}

/**
 * Everything below the topbar on `/`.
 *
 * The sentence under the title is the product's claim, which is why it sits on
 * the first screen and not in an About box: every sentence of an answer carries
 * the passage it came from.
 *
 * The two Create buttons do nothing yet. Creating a notebook is a POST and the
 * endpoint is wired in M4-T6; until then the grid is fixtures and a handler here
 * would have to invent an id the server has not issued.
 */
export function HomePage({ notebooks, state }: HomePageProps) {
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
        <Button size="lg" type="button">
          <Icon name="plus" />
          Create new notebook
        </Button>
      </div>

      <NotebookGrid notebooks={notebooks} state={state} />
    </div>
  );
}
