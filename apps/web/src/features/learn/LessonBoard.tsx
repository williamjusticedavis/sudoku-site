import { useMemo } from 'react';
import type { CandidateMarker, CellRole } from '../solver/highlights.js';
import { buildCandidateMarkers, buildHighlightMap } from '../solver/highlights.js';
import { parseLessonGrid, stepCells, toEngineStep } from './stepAdapter.js';
import type { LessonStep } from './types.js';

/** Cell backgrounds per solve-step role — kept in step with the solver grid. */
const ROLE_BG: Record<CellRole, string> = {
  placement: 'bg-emerald-200 dark:bg-emerald-800/70',
  elimination: 'bg-rose-200 dark:bg-rose-800/70',
  base: 'bg-sky-200 dark:bg-sky-800/70',
  cover: 'bg-indigo-200 dark:bg-indigo-800/70',
  fin: 'bg-amber-200 dark:bg-amber-700/70',
  related: 'bg-violet-200 dark:bg-violet-900/50',
  focus: 'bg-neutral-300 dark:bg-neutral-600/70',
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
}: {
  mask: number;
  markers: Map<number, CandidateMarker> | undefined;
}) {
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[clamp(0.5rem,2.2cqw,0.85rem)] leading-none text-neutral-500 dark:text-neutral-400">
      {Array.from({ length: 9 }, (_, k) => {
        const d = k + 1;
        const has = (mask & (1 << k)) !== 0;
        const marker = markers?.get(d);
        const show = has || marker === 'eliminated';
        return (
          <span key={k} className="relative flex items-center justify-center">
            {marker && show && <CandidateMark marker={marker} />}
            <span className={marker === 'eliminated' && !has ? 'opacity-50' : ''}>
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
}

export function LessonBoard({
  grid,
  step,
  dimOutsideFocus = true,
  focusMode = 'cells',
  showCandidates = true,
}: LessonBoardProps) {
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

  return (
    <div
      role="grid"
      aria-label="Lesson sudoku grid"
      className="grid aspect-square w-full max-w-[680px] grid-cols-9 grid-rows-[repeat(9,minmax(0,1fr))] rounded-sm border-2 border-neutral-700 [container-type:inline-size] dark:border-neutral-300"
    >
      {Array.from({ length: 81 }, (_, i) => {
        const col = i % 9;
        const row = Math.floor(i / 9);
        const digit = placed[i] ?? 0;
        const role = roleMap.get(i);
        const markers = markerMap.get(i);
        const dim = focus ? !focus.has(i) : false;
        return (
          <div
            key={i}
            role="gridcell"
            className={[
              'relative flex h-full w-full items-center justify-center text-[clamp(0.9rem,6.2cqw,3rem)] font-medium select-none',
              'border-r border-b border-neutral-300 dark:border-neutral-700',
              role ? ROLE_BG[role] : 'bg-white dark:bg-neutral-900',
              digit !== 0 ? 'text-blue-600 dark:text-blue-400' : '',
              col % 3 === 2 && col !== 8
                ? 'border-r-2 border-r-neutral-600 dark:border-r-neutral-300'
                : '',
              row % 3 === 2 && row !== 8
                ? 'border-b-2 border-b-neutral-600 dark:border-b-neutral-300'
                : '',
              dim ? 'opacity-25' : '',
            ].join(' ')}
          >
            {digit !== 0 ? (
              digit
            ) : showCandidates ? (
              <NoteMarks mask={candidates[i] ?? 0} markers={markers} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
