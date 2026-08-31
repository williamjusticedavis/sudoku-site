import { PEERS } from '@sudoku/engine';
import { useEffect, useId, useMemo, useState } from 'react';
import type { CandidateMarker, CellRole } from '../solver/highlights.js';
import { buildCandidateMarkers, buildHighlightMap } from '../solver/highlights.js';
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

/** Cell backgrounds per solve-step role. Started identical to the solver
 * grid's own `ROLE_BG` (`features/solver/SudokuGrid.tsx`); `base`/`related`
 * were deliberately swapped here (base=purple, related=light blue) during
 * the Learn lesson polish pass for consistency across every lesson's own
 * base/related pairing — the solver grid's copy was intentionally left
 * unswapped, so the two now diverge on purpose. */
const ROLE_BG: Record<CellRole, string> = {
  placement: 'bg-emerald-200 dark:bg-emerald-800/70',
  elimination: 'bg-rose-200 dark:bg-rose-800/70',
  base: 'bg-violet-200 dark:bg-violet-900/50',
  cover: 'bg-indigo-200 dark:bg-indigo-800/70',
  fin: 'bg-amber-200 dark:bg-amber-700/70',
  related: 'bg-sky-200 dark:bg-sky-800/70',
  focus: 'bg-slate-300 dark:bg-neutral-600/70',
  scan: 'bg-slate-100 dark:bg-neutral-800/50',
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
function unitOutlineSpan(
  cells: readonly number[],
): { gridRow: string; gridColumn: string } | null {
  const unique = new Set(cells);
  if (unique.size !== 9) return null;
  const rows = new Set([...unique].map((c) => Math.floor(c / 9)));
  const cols = new Set([...unique].map((c) => c % 9));
  const boxes = new Set(
    [...unique].map(
      (c) => Math.floor(Math.floor(c / 9) / 3) * 3 + Math.floor((c % 9) / 3),
    ),
  );
  if (rows.size === 1) {
    const r = [...rows][0]!;
    return { gridRow: `${r + 1} / ${r + 2}`, gridColumn: '1 / 10' };
  }
  if (cols.size === 1) {
    const c = [...cols][0]!;
    return { gridColumn: `${c + 1} / ${c + 2}`, gridRow: '1 / 10' };
  }
  if (boxes.size === 1) {
    const b = [...boxes][0]!;
    const br = Math.floor(b / 3);
    const bc = b % 3;
    return {
      gridRow: `${br * 3 + 1} / ${br * 3 + 4}`,
      gridColumn: `${bc * 3 + 1} / ${bc * 3 + 4}`,
    };
  }
  return null;
}

/** Every outline to draw for a step. Two paths:
 *  - A template that already knows exactly which unit(s) it wants framed
 *    hands them over explicitly as one or more `outline-unit`-role groups
 *    (e.g. X-Wing's two base rows, drawn as two separate outlines at once —
 *    locked-candidates/naked-subset/hidden-subset use just one).
 *  - Otherwise, fall back to the legacy merge of 'related'/'placement'/
 *    'focus' cells into a single implied unit (cross-hatching/last-possible-
 *    number, which never set 'outline-unit' explicitly).
 * Each candidate cell set only produces an outline if it's exactly one full
 * row/column/box — most fish/wing patterns aren't, and get none. */
function unitOutlineSpans(step: LessonStep): { gridRow: string; gridColumn: string }[] {
  const explicitGroups = (step.highlights ?? []).filter((g) => g.role === 'outline-unit');
  if (explicitGroups.length > 0) {
    return explicitGroups
      .map((g) => unitOutlineSpan(g.cells))
      .filter((s): s is { gridRow: string; gridColumn: string } => s !== null);
  }
  const roles = new Set(['related', 'placement', 'focus']);
  const cells: number[] = [];
  for (const g of step.highlights ?? []) if (roles.has(g.role)) cells.push(...g.cells);
  for (const p of step.placements ?? []) cells.push(p.cell);
  const span = unitOutlineSpan(cells);
  return span ? [span] : [];
}

/** Center of cell `i` in a 9×9 unit-square coordinate space (1 unit = 1 cell). */
function cellCenter(i: number): [number, number] {
  return [(i % 9) + 0.5, Math.floor(i / 9) + 0.5];
}

/** An arrow's line, trimmed back from both cell centers so it doesn't run
 * straight through either cell's digit — it reads as pointing from the
 * blocking cell's neighborhood to the excluded cell's, not through them. */
function arrowSegment(from: number, to: number, inset = 0.32) {
  const [x1, y1] = cellCenter(from);
  const [x2, y2] = cellCenter(to);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * inset,
    y1: y1 + uy * inset,
    x2: x2 - ux * inset,
    y2: y2 - uy * inset,
  };
}

export function LessonBoard({
  grid,
  step,
  dimOutsideFocus = true,
  focusMode = 'cells',
  showCandidates = true,
  interactive = true,
}: LessonBoardProps) {
  const arrowMarkerId = useId();
  const arrows = step?.arrows ?? [];
  const xLines = step?.xLines ?? [];

  const [selected, setSelected] = useState<number | null>(null);
  const [digitHighlight, setDigitHighlight] = useState<number | null>(null);
  // Drop any selection/activation the moment interaction turns off (the hint
  // just got revealed) or the board underneath changes (new puzzle) — stale
  // selection state pointing at an unrelated board is worse than none.
  useEffect(() => {
    setSelected(null);
    setDigitHighlight(null);
  }, [grid, interactive]);
  const { placed, candidates, roleMap, markerMap, focus, unitOutlines } = useMemo(() => {
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
      unitOutlines: step ? unitOutlineSpans(step) : [],
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
      {unitOutlines.map((span, i) => (
        // Absolutely positioned so it's sized against the grid lines named in
        // `span` without joining auto-placement — a normal grid item
        // spanning a whole row/column/box would otherwise compete with the 81
        // cell divs for space and shove them out of position. `inset-0` is
        // required too: grid-row/grid-column alone only anchor an abspos
        // item's static position, they don't stretch it — without inset-0 it
        // collapses to a 0×0 box (just the border, a stray little square).
        // Usually just one span; X-Wing draws two at once (both base lines).
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute inset-0 border-2 border-cyan-600 dark:border-cyan-400"
          style={span}
        />
      ))}
      {arrows.length > 0 && (
        // Cross-hatching: a line from each blocking digit straight to the
        // one cell it rules out — concrete instead of leaving the learner to
        // trace the highlighted scanline themselves. viewBox is a 9×9 unit
        // grid (1 unit = 1 cell), so cell-index math maps directly to it.
        <svg
          aria-hidden
          viewBox="0 0 9 9"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <marker
              id={arrowMarkerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              markerUnits="strokeWidth"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="fill-rose-600 dark:fill-rose-400" />
            </marker>
          </defs>
          {arrows.map((a, i) => {
            const seg = arrowSegment(a.from, a.to);
            return (
              <line
                key={i}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                strokeWidth="0.07"
                className="stroke-rose-600 dark:stroke-rose-400"
                markerEnd={`url(#${arrowMarkerId})`}
              />
            );
          })}
        </svg>
      )}
      {xLines.length > 0 && (
        // X-Wing: connect the pattern's 4 corner cells corner-to-corner so
        // the shape reads literally as an X, not just two highlighted rows
        // and two highlighted columns the learner has to mentally cross.
        // Plain lines, no arrowhead — this isn't "blocks that", just a shape.
        <svg
          aria-hidden
          viewBox="0 0 9 9"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {xLines.map((l, i) => {
            const seg = arrowSegment(l.from, l.to);
            return (
              <line
                key={i}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                strokeWidth="0.06"
                strokeDasharray={l.style === 'dashed' ? '0.18 0.12' : undefined}
                className="stroke-emerald-600 dark:stroke-emerald-400"
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
