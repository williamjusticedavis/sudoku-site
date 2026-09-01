import { PEERS } from '@sudoku/engine';
import { useEffect, useMemo, useState } from 'react';
import type { CandidateMarker } from '../solver/highlights.js';
import {
  buildCandidateMarkers,
  buildHighlightMap,
  ROLE_BG,
} from '../solver/highlights.js';
import { StepOverlays } from '../solver/stepOverlay.js';
import { parseLessonGrid, stepCells, toEngineStep } from './stepAdapter.js';
import type { LessonStep } from './types.js';

/** Explore-mode highlighting — same idea as the solver grid's: click selects
 * a cell (its peers dim up slightly), double-click "activates" a digit (every
 * instance of it, plus their peers). Independent of solve-step roles, which
 * is fine because the two never appear together: interaction only runs while
 * `step` is null (the learner hasn't asked for the hint yet). */
type Interaction = 'match' | 'peer';

const INTERACTION_BG: Record<Interaction, string> = {
  match: 'bg-yellow-200 dark:bg-yellow-600/40',
  peer: 'bg-neutral-300/70 dark:bg-neutral-700/70',
};

function CandidateMark({ marker }: { marker: CandidateMarker }) {
  const stroke = marker === 'eliminated' ? 'stroke-rose-500' : 'stroke-emerald-500';
  return (
    <svg
      viewBox="0 0 24 24"
      className={`pointer-events-none absolute inset-0 h-full w-full ${stroke}`}
      fill="none"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      {marker === 'eliminated' && <line x1="5.6" y1="18.4" x2="18.4" y2="5.6" />}
    </svg>
  );
}

function NoteMarks({
  mask,
  markers,
  highlightDigit,
}: {
  mask: number;
  markers: Map<number, CandidateMarker> | undefined;
  /** Bold this digit wherever it appears as a candidate — set by double-
   * clicking a placed instance of it, so every cell that could still take it
   * jumps out (the whole point for a lesson like Last Possible Number). */
  highlightDigit?: number | null;
}) {
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[clamp(0.5rem,2.2cqw,0.85rem)] leading-none text-neutral-500 dark:text-neutral-400">
      {Array.from({ length: 9 }, (_, k) => {
        const d = k + 1;
        const has = (mask & (1 << k)) !== 0;
        const marker = markers?.get(d);
        const show = has || marker === 'eliminated';
        const hot = has && highlightDigit === d;
        return (
          <span key={k} className="relative flex items-center justify-center">
            {marker && show && <CandidateMark marker={marker} />}
            <span
              className={[
                hot
                  ? 'rounded-sm bg-amber-300 px-0.5 font-bold text-amber-900 dark:bg-transparent dark:px-0 dark:text-yellow-300'
                  : '',
                marker === 'eliminated' && !has ? 'opacity-50' : '',
              ].join(' ')}
            >
              {show ? d : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface LessonBoardProps {
  /** 81-char grid string (0 = blank) for the position to display. */
  grid: string;
  /** The step to highlight, or null for a plain board. */
  step: LessonStep | null;
  /** Dim every cell outside the focus region. */
  dimOutsideFocus?: boolean;
  /** 'cells' (default) keeps only the current beat's own cells bright — a cell
   * that becomes an elimination target later stays dim until its beat. 'empty'
   * additionally keeps every unsolved cell bright (for BUG+1, whose reasoning
   * is about the whole board). */
  focusMode?: 'cells' | 'empty';
  /** Hide pencil-mark candidates entirely (default true). Off for lessons like
   * Last Free Cell, where the technique doesn't involve candidates at all and
   * showing them implies otherwise. */
  showCandidates?: boolean;
  /** Let the learner click/double-click cells to explore (select a cell, or
   * double-click to light up every instance of its digit) — no digit entry,
   * just looking. Meant for the "try it yourself" phase before the hint is
   * shown; pass false once revealed so the step's own highlighting isn't
   * competing with leftover selection state. Default true. */
  interactive?: boolean;
}

/** If a set of cells is exactly one full row, column, or box, the CSS
 * grid-line span framing it — so the board can draw a light outline around
 * "the unit" a beat's text is pointing at (e.g. "Look at column 9"). Anything
 * short of a full unit yields no outline. */
export function LessonBoard({
  grid,
  step,
  dimOutsideFocus = true,
  focusMode = 'cells',
  showCandidates = true,
  interactive = true,
}: LessonBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [digitHighlight, setDigitHighlight] = useState<number | null>(null);
  // Drop any selection/activation the moment interaction turns off (the hint
  // just got revealed) or the board underneath changes (new puzzle) — stale
  // selection state pointing at an unrelated board is worse than none.
  useEffect(() => {
    setSelected(null);
    setDigitHighlight(null);
  }, [grid, interactive]);
  const { placed, candidates, roleMap, markerMap, focus } = useMemo(() => {
    const parsed = parseLessonGrid(grid);
    const engineStep = step ? toEngineStep(step) : null;
    const frameCells = step ? stepCells(step) : [];
    let focusSet: Set<number> | null = null;
    if (step && dimOutsideFocus) {
      focusSet = new Set(frameCells);
      if (focusMode === 'empty') {
        for (let i = 0; i < 81; i++) if ((parsed.placed[i] ?? 0) === 0) focusSet.add(i);
      }
    }
    return {
      placed: parsed.placed,
      candidates: parsed.candidates,
      roleMap: buildHighlightMap(engineStep),
      markerMap: buildCandidateMarkers(engineStep),
      focus: focusSet,
    };
  }, [grid, step, dimOutsideFocus, focusMode]);

  const interactionMap = useMemo(() => {
    const map = new Map<number, Interaction>();
    if (!interactive) return map;
    const active: number[] = [];
    if (digitHighlight !== null) {
      for (let i = 0; i < 81; i++) if (placed[i] === digitHighlight) active.push(i);
    } else if (selected !== null) {
      active.push(selected);
    }
    for (const c of active) for (const p of PEERS[c]!) map.set(p, 'peer');
    for (const c of active) map.set(c, 'match');
    return map;
  }, [interactive, placed, selected, digitHighlight]);

  function handleSelect(cell: number) {
    setSelected(cell);
    setDigitHighlight(null);
  }
  function handleActivate(cell: number) {
    const d = placed[cell] ?? 0;
    setSelected(cell);
    setDigitHighlight(d === 0 ? null : d);
  }

  return (
    <div
      role="grid"
      aria-label="Lesson sudoku grid"
      className="text-scale-fixed relative grid aspect-square w-full max-w-[680px] grid-cols-9 grid-rows-[repeat(9,minmax(0,1fr))] rounded-sm border-2 border-neutral-700 [container-type:inline-size] dark:border-neutral-300"
    >
      {Array.from({ length: 81 }, (_, i) => {
        const col = i % 9;
        const row = Math.floor(i / 9);
        const digit = placed[i] ?? 0;
        const role = roleMap.get(i);
        const markers = markerMap.get(i);
        const dim = focus ? !focus.has(i) : false;
        const inter = interactionMap.get(i);
        const isSelected = interactive && selected === i;
        return (
          // Border lives on this outer cell so it never fades under
          // `dimOutsideFocus` — only the fill/text (inner div) dims, keeping
          // every grid line, including ones framing the highlighted region,
          // crisp regardless of what's dimmed around it.
          <div
            key={i}
            role="gridcell"
            className={[
              'relative border-r border-b border-neutral-400 dark:border-neutral-500',
              col % 3 === 2 && col !== 8
                ? 'border-r-2 border-r-neutral-600 dark:border-r-neutral-300'
                : '',
              row % 3 === 2 && row !== 8
                ? 'border-b-2 border-b-neutral-600 dark:border-b-neutral-300'
                : '',
            ].join(' ')}
          >
            <div
              onPointerDown={interactive ? () => handleSelect(i) : undefined}
              onClick={interactive ? () => handleSelect(i) : undefined}
              onDoubleClick={interactive ? () => handleActivate(i) : undefined}
              className={[
                'relative flex h-full w-full items-center justify-center text-[clamp(0.9rem,6.2cqw,3rem)] font-medium select-none',
                interactive ? 'touch-manipulation cursor-pointer' : '',
                role
                  ? ROLE_BG[role]
                  : inter
                    ? INTERACTION_BG[inter]
                    : 'bg-white dark:bg-neutral-900',
                digit !== 0 ? 'text-blue-600 dark:text-blue-400' : '',
                dim ? 'opacity-25' : '',
                isSelected ? 'z-10 ring-2 ring-inset ring-blue-500' : '',
              ].join(' ')}
            >
              {digit !== 0 ? (
                <>
                  {markers?.get(digit) === 'marked' && (
                    <svg
                      viewBox="0 0 24 24"
                      className="pointer-events-none absolute inset-0 h-full w-full stroke-emerald-500"
                      fill="none"
                      strokeWidth="1"
                    >
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  )}
                  {digit}
                </>
              ) : showCandidates ? (
                <NoteMarks
                  mask={candidates[i] ?? 0}
                  markers={markers}
                  highlightDigit={digitHighlight}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      <StepOverlays step={step ?? null} />
    </div>
  );
}
