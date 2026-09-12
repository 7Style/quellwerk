import { HomePage, notebookFixtures } from '@/modules/notebooks';
import { Topbar } from '@/modules/shell';

/**
 * Home.
 *
 * The topbar is fixed and the grid below it scrolls, so the page itself never
 * does. That is the same rule the notebook route follows, and keeping both
 * routes to it means the browser's scrollbar always belongs to one region a
 * reader can point at.
 *
 * The notebooks are fixtures until M4-T6 replaces them with the endpoint.
 */
export default function Page() {
  return (
    <div className="flex h-dvh flex-col">
      <Topbar />
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="scroll-home">
        <HomePage notebooks={notebookFixtures} />
      </div>
    </div>
  );
}
