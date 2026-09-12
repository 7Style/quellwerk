'use client';

import { useState, type ReactNode } from 'react';

import { Panel } from './Panel';

export interface WorkspaceProps {
  sources: ReactNode;
  /** Pinned under the sources list: the Add source button. */
  sourcesFooter?: ReactNode;
  /** The sources slot brings its own scrolling and its own foot (Panel.fills). */
  sourcesFill?: boolean;
  sourceCount?: number;
  chat: ReactNode;
  /** Pinned under the thread: the composer. Does not scroll with it. */
  composer?: ReactNode;
  studio: ReactNode;
}

/**
 * The three column layout of a notebook, and the only thing on this page that
 * holds state in M4-T1: whether each side panel is open.
 *
 * The slots arrive as props rather than as imports. Sources, chat and studio are
 * three separate modules and a module may not import another one
 * (frontend/eslint.config.mjs), so the page that owns the route composes them
 * and this component only places them. It is also what lets three panels be
 * built in parallel against their own fixtures.
 *
 * The column widths are written as a grid template rather than as a class per
 * state: the collapsed width is the rail and the open width is a token that a
 * media query narrows below 1360px, and an inline template keeps both facts in
 * one place instead of spreading them over four Tailwind variants.
 */
export function Workspace({
  sources,
  sourcesFooter,
  sourcesFill,
  sourceCount,
  chat,
  composer,
  studio,
}: WorkspaceProps) {
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [studioCollapsed, setStudioCollapsed] = useState(false);

  const left = sourcesCollapsed ? 'var(--w-rail)' : 'var(--w-sources)';
  const right = studioCollapsed ? 'var(--w-rail)' : 'var(--w-studio)';

  return (
    <main
      className="grid min-h-0 flex-1"
      style={{ gridTemplateColumns: `${left} minmax(0, 1fr) ${right}` }}
      data-testid="workspace"
    >
      <Panel
        side="left"
        title="Sources"
        count={sourceCount}
        collapsed={sourcesCollapsed}
        onToggle={() => setSourcesCollapsed((open) => !open)}
        footer={sourcesFooter}
        fills={sourcesFill}
      >
        {sources}
      </Panel>

      <section className="flex min-h-0 min-w-0 flex-col bg-paper">
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-testid="scroll-chat"
        >
          {chat}
        </div>
        {composer ? <div className="flex-none">{composer}</div> : null}
      </section>

      <Panel
        side="right"
        title="Studio"
        collapsed={studioCollapsed}
        onToggle={() => setStudioCollapsed((open) => !open)}
      >
        {studio}
      </Panel>
    </main>
  );
}
