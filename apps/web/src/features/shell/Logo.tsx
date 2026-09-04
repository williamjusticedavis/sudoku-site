/** The Gridwise mark: a 3×3 grid with the centre cell solved.
 *
 * An inline SVG component rather than an asset file, so the rules inherit
 * `currentColor` and the mark needs no second copy for dark mode. The one
 * literal colour is the filled cell, which uses the same blue the solver's
 * primary buttons already use.
 *
 * Deliberately not a digit in the solved cell: a glyph stops being readable
 * around 16px, which is exactly the size a favicon and a header mark are asked
 * to work at. A filled square survives it.
 *
 * `apps/web/public/favicon.svg` is the same geometry with literal colours —
 * keep the two in step if this changes.
 */
export function Logo({ className }: { className?: string }) {
  const S = 8; // cell size
  const P = 1; // padding, so the outer stroke isn't clipped by the viewBox

  const lines = [];
  for (let i = 0; i <= 3; i += 1) {
    lines.push(
      <line key={`h-${i}`} x1={P} y1={P + i * S} x2={P + 3 * S} y2={P + i * S} />,
      <line key={`v-${i}`} x1={P + i * S} y1={P} x2={P + i * S} y2={P + 3 * S} />,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${2 * P + 3 * S} ${2 * P + 3 * S}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x={P + S} y={P + S} width={S} height={S} className="fill-blue-600" />
      <g stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.75}>
        {lines}
      </g>
    </svg>
  );
}
