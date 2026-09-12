'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CitedText } from '@/components/cited-text';
import { Icon } from '@/components/icon';
import type { Citation } from '@/lib/citation';
import { citationsOnCard, isWritingCards, type Flashcards } from '../types/flashcards';

export interface FlashcardsViewProps {
  deck: Flashcards | null;
  loading?: boolean;
  onClose: () => void;
  onOpenCitation: (citation: Citation) => void;
  onRebuild: () => Promise<void>;
}

/**
 * Der Kartenstapel in der Spalte des Gesprächs.
 *
 * Eine Karte auf einmal, umdrehbar, mit der Zahl daneben - das ist, was man von
 * einem Stapel erwartet, und es hält die Aufmerksamkeit auf einer Frage statt
 * auf einer Liste von zwanzig.
 *
 * Die Rückseite wird mit demselben Renderer gezeichnet wie eine Antwort, also
 * trägt sie ihre Chips: ein Klick öffnet die Stelle in der Quelle. Genau das
 * unterscheidet diese Karten von den Karten, die man sich selbst schreibt - man
 * kann nachsehen, ob stimmt, was darauf steht.
 */
export function FlashcardsView({
  deck,
  loading = false,
  onClose,
  onOpenCitation,
  onRebuild,
}: FlashcardsViewProps) {
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = deck?.cards ?? [];
  const writing = isWritingCards(deck);
  const card = cards[at] ?? null;

  function go(delta: number): void {
    setFlipped(false);
    setAt((index) => Math.min(Math.max(index + delta, 0), Math.max(cards.length - 1, 0)));
  }

  return (
    <div
      className="mx-auto grid max-w-[var(--measure)] gap-4 px-5 py-6"
      data-testid="flashcards-view"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          aria-label="Back to the conversation"
          data-testid="flashcards-close"
        >
          <Icon name="chevronLeft" />
        </Button>
        <span className="text-small text-ink-faint">
          Flashcards{cards.length > 0 ? ` · ${at + 1} of ${cards.length}` : ''}
        </span>
        <span className="flex-1" />
        {deck && !writing ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => void onRebuild()}
            data-testid="flashcards-rebuild"
          >
            <Icon name="refresh" className="h-[14px] w-[14px]" />
            Write again
          </Button>
        ) : null}
      </div>

      {loading || writing ? (
        <div className="grid gap-3">
          <p className="m-0 text-ui text-ink-muted" role="status" data-testid="flashcards-state">
            Reading the sources and writing the cards
          </p>
          <span
            aria-hidden="true"
            className="block h-[3px] overflow-hidden rounded-[2px] bg-surface-sunken"
          >
            <span className="block h-full w-1/3 bg-ink-faint motion-safe:animate-[qw-slide_1.4s_ease-in-out_infinite]" />
          </span>
        </div>
      ) : null}

      {!loading && deck?.status === 'failed' ? (
        <div className="grid gap-2" role="alert">
          <p className="m-0 text-ui font-medium">The cards could not be written.</p>
          <p className="m-0 text-ink-muted">{deck.error}</p>
        </div>
      ) : null}

      {!loading && !writing && card ? (
        <>
          {/* Der ganze Block ist der Knopf zum Umdrehen, ausser den Chips auf
              der Rueckseite: ein Chip fuehrt in die Quelle und darf die Karte
              nicht nebenbei zurueckdrehen. */}
          <div
            className="grid min-h-[220px] content-center gap-4 rounded-surface border border-rule bg-surface p-6"
            data-testid="flashcard"
            data-side={flipped ? 'back' : 'front'}
          >
            <p className="m-0 font-read text-h3 leading-read">{card.question}</p>

            {flipped ? (
              <div className="grid gap-3 border-t border-rule pt-4">
                <CitedText
                  segments={card.answer}
                  onOpenCitation={onOpenCitation}
                  className="font-read text-read leading-read"
                />
                <span className="text-small text-ink-faint">
                  {citationsOnCard(card).length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-cite-ink tabular-nums">
                      <Icon name="quote" className="h-[13px] w-[13px]" />
                      {citationsOnCard(card).length}{' '}
                      {citationsOnCard(card).length === 1 ? 'citation' : 'citations'}
                    </span>
                  ) : (
                    'No citation on this card'
                  )}
                </span>
              </div>
            ) : (
              <Button
                variant="outline"
                type="button"
                onClick={() => setFlipped(true)}
                className="justify-self-start"
                data-testid="flashcard-flip"
              >
                Show the answer
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => go(-1)}
              disabled={at === 0}
              data-testid="flashcard-previous"
            >
              <Icon name="chevronLeft" className="h-[14px] w-[14px]" />
              Previous
            </Button>
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => go(1)}
              disabled={at >= cards.length - 1}
              data-testid="flashcard-next"
            >
              Next
              <Icon name="chevronRight" className="h-[14px] w-[14px]" />
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
