import { useId } from 'react';

/**
 * The decorations a narrated step draws OVER the board: the outline framing
 * the unit being reasoned about, "this blocks that" arrows, and the link lines
 * that make a chain's shape readable. Shared by the solver grid and the Learn
 * lesson board so one step looks the same wherever it's read — they were
 * previously only on the lesson board, which is why the solver's step list
 * read as bare cell highlights next to the same technique's lesson.
 *
 * Structurally typed rather than taking an engine `Step`: the lesson board
 * feeds it a stored `LessonStep` and the solver an `ExplainBeat`.
 */
export interface OverlayStep {
  highlights?: readonly { role: string; cells: readonly number[] }[];
  placements?: readonly { cell: number }[];
  arrows?: readonly { from: number; to: number }[];
  xLines?: readonly { from: number; to: number; style?: 'solid' | 'dashed' }[];
}

type Span = { gridRow: string; gridColumn: string };

/** A cell set's outline span, but only if it's exactly one full row, column or
 * box — most fish/wing patterns aren't, and get no outline. */
function unitOutlineSpan(cells: readonly number[]): Span | null {
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
 *  - Otherwise, fall back to the merge of 'related'/'placement'/'focus' cells
 *    into a single implied unit (cross-hatching/last-possible-number, which
 *    never set 'outline-unit' explicitly).
 */
export function unitOutlineSpans(step: OverlayStep): Span[] {
  const explicitGroups = (step.highlights ?? []).filter((g) => g.role === 'outline-unit');
  if (explicitGroups.length > 0) {
    return explicitGroups
      .map((g) => unitOutlineSpan(g.cells))
      .filter((s): s is Span => s !== null);
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

/** A link's line, trimmed back from both cell centers so it doesn't run
 * straight through either cell's digit — it reads as connecting the two
 * cells' neighborhoods, not striking through them. */
function segment(from: number, to: number, inset = 0.32) {
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

/**
 * Renders as a fragment, so it must be a direct child of the 9×9 grid
 * container (which needs `relative`): the outlines are absolutely positioned
 * against that grid's own lines, and the two SVG layers use a 9×9 viewBox
 * where 1 unit = 1 cell.
 */
export function StepOverlays({ step }: { step: OverlayStep | null }) {
  const arrowMarkerId = useId();
  const outlines = step ? unitOutlineSpans(step) : [];
  const arrows = step?.arrows ?? [];
  const xLines = step?.xLines ?? [];

  return (
    <>
      {outlines.map((span, i) => (
        // Absolutely positioned so it's sized against the grid lines named in
        // `span` without joining auto-placement — a normal grid item spanning
        // a whole row/column/box would otherwise compete with the 81 cell divs
        // for space and shove them out of position. `inset-0` is required too:
        // grid-row/grid-column alone only anchor an abspos item's static
        // position, they don't stretch it — without inset-0 it collapses to a
        // 0×0 box (just the border, a stray little square).
        <div
          key={`o${i}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 border-2 border-cyan-600 dark:border-cyan-400"
          style={span}
        />
      ))}
      {arrows.length > 0 && (
        // "This digit rules out that cell" — concrete, instead of leaving the
        // reader to trace a highlighted scanline themselves.
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
            const seg = segment(a.from, a.to);
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
        // Link lines: solid for a strong link ("not one → the other"), dashed
        // for a weak one ("not both"). No arrowhead — a shape, not a blocking
        // relationship: X-Wing's four corners literally drawn as an X, a
        // chain drawn as the chain it is.
        <svg
          aria-hidden
          viewBox="0 0 9 9"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {xLines.map((l, i) => {
            const seg = segment(l.from, l.to);
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
    </>
  );
}
