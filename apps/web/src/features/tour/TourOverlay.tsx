import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { stepsFor, type TourStep } from './steps.js';
import { useTour } from './TourProvider.js';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6; // breathing room between the highlight ring and the element
const CARD_W = 340;
const GAP = 12; // between the highlight and the card
const EDGE = 12; // minimum distance from the viewport edge

/** How long to keep looking for a step's target before giving up and centring
 * the card. Each tour runs on the page its steps describe, so a target is
 * normally there on the first frame — this covers content that arrives a beat
 * late, such as the Learn tiers coming from a server loader. */
const FIND_TIMEOUT_MS = 1500;

/** Shorter for optional steps: their targets are conditional parts of a page
 * that's already up (the step list only exists once you've solved something),
 * so waiting the full budget only stalls the walk. */
const OPTIONAL_TIMEOUT_MS = 300;

function findTarget(step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  const sel = step.selector ?? `[data-tour="${step.target}"]`;
  const el = document.querySelector<HTMLElement>(sel);
  // Present in the DOM is not the same as on screen. The desktop/mobile split
  // here is done with Tailwind's `lg:hidden` and `hidden lg:block`, so both
  // variants of the step list exist in the markup at all times and only one is
  // displayed. Without this check a wide screen would stop at "the bar at the
  // bottom" and ring nothing at all.
  //
  // `getClientRects()` rather than `offsetParent`, which is null for the
  // position-fixed mobile bar even when it is perfectly visible.
  if (!el || el.getClientRects().length === 0) return null;
  return el;
}

/**
 * The spotlight. Four dimming panels around the target rather than one
 * translucent sheet with a hole punched in it — no SVG mask, no stacking
 * tricks, and the gap between them *is* the cut-out, so the real control shows
 * through at full contrast.
 *
 * The rect is remeasured every frame while the tour is up. That sounds
 * wasteful and isn't: it's one getBoundingClientRect per frame, and it means
 * smooth scrolling, the mobile toolbar collapsing, a layout shift from a
 * loaded font — anything at all — can't leave the ring behind the element it
 * was drawn around.
 */
export function TourOverlay() {
  const { tour, index, active, stop, go, goTo, skip } = useTour();

  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const steps = tour ? stepsFor(tour) : [];
  const step = index === null ? null : steps[index];
  /** Which way the reader is walking, so a skipped step is stepped *over*
   * rather than bouncing them back the way they came. */
  const dir = useRef(1);

  // Find the step's target once we're on its page, scroll it into view, and
  // decide what to do when it never turns up.
  useEffect(() => {
    if (!step) return;
    setReady(false);
    setRect(null);
    if (!step.target) {
      setReady(true);
      return;
    }
    let raf = 0;
    const deadline =
      performance.now() + (step.optional ? OPTIONAL_TIMEOUT_MS : FIND_TIMEOUT_MS);
    const look = () => {
      const el = findTarget(step);
      if (el) {
        // Scroll first, then measure, then publish both at once. Measuring
        // after the scroll matters because the scroll is what moves the
        // element; publishing together matters because a card that renders
        // before its rect is known appears in the fallback position and then
        // hops to the real one, which reads as the new text arriving and *then*
        // the card moving.
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setReady(true);
        return;
      }
      if (performance.now() > deadline) {
        // Optional steps describe controls that only exist in some states —
        // an empty grid has no step list. Step over them.
        if (step.optional && index !== null) skip(index, dir.current || 1);
        else setReady(true); // centred card; the copy still stands alone
        return;
      }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [step, index, skip]);

  // Track the target's box for as long as it's spotlit.
  useEffect(() => {
    if (!active || !ready || !step?.target) return;
    let raf = 0;
    const measure = () => {
      const el = findTarget(step);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((prev) =>
          prev &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
            ? prev
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [active, ready, step]);

  const move = useCallback(
    (delta: number) => {
      dir.current = delta;
      // Resolve past optional steps here, synchronously, rather than entering
      // one and letting the search skip it a few frames later. The page these
      // steps belong to is already on screen, so a `querySelector` now is
      // conclusive — and entering a step that has nothing to point at blanks
      // the overlay for the length of the search, which reads as the tour
      // jumping a number. The async skip stays as a backstop for a target that
      // renders a beat late — the Learn tiers arrive from a server loader.
      if (index === null) return;
      let next = index + delta;
      while (next >= 0 && next < steps.length) {
        const candidate = steps[next];
        if (!candidate) break;
        if (candidate.optional && !findTarget(candidate)) {
          next += delta;
          continue;
        }
        break;
      }
      if (next === index + delta) go(delta);
      else goTo(next);
    },
    [go, goTo, index, steps],
  );

  // Captured, so the tour's keys never reach the solver's own handlers
  // underneath (Escape puts the step panel away; that would fire too).
  //
  // One stop per press: `e.repeat` drops the OS key-repeat from a held arrow,
  // which would otherwise skip several stops before you've read one.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        move(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        move(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, stop, move]);

  if (!active || !step || typeof document === 'undefined') return null;
  // A step that points at something waits for its rect as well as its target:
  // position and content have to land in the same paint, or the card is seen
  // moving after the fact.
  if (!ready || (step.target && !rect)) {
    // Resolving: keep the screen dimmed so the tour doesn't blink out and back
    // between stops. No ring and no card until we know where they go.
    return createPortal(
      <div className="fixed inset-0 z-50 bg-neutral-950/60 dark:bg-neutral-950/75" />,
      document.body,
    );
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 640;

  const hole = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Where the card goes, in order of preference: below the target, above it,
  // or beside it. Beside is what saves the tall targets — the grid is most of
  // the viewport, so "above" for it means "on top of the site header", and
  // there is plenty of room to its left instead.
  //
  // Note what this deliberately does NOT do: measure the card. An earlier
  // version picked a side by comparing the free space against the card's
  // height, which is only known a frame late — so a step whose card was taller
  // than the previous one chose "below" on a stale number and hung off the
  // bottom of the screen. Instead the card is pinned by whichever edge faces
  // the target (`top` below it, `bottom` above it) and given a `maxHeight` of
  // the space that's actually there. CSS then fits it, whatever it contains.
  //
  // On a phone none of this applies: the card docks to the bottom edge, since
  // there is rarely room for a 340px card next to anything.
  const MIN_CARD = 180; // below this a slot is too cramped to read in

  let card: {
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null = null;

  if (hole && !narrow) {
    const roomBelow = vh - (hole.top + hole.height + GAP) - EDGE;
    const roomAbove = hole.top - GAP - EDGE;
    const roomRight = vw - (hole.left + hole.width + GAP) - EDGE;
    const roomLeft = hole.left - GAP - EDGE;
    const centredLeft = Math.min(
      Math.max(EDGE, hole.left + hole.width / 2 - CARD_W / 2),
      vw - CARD_W - EDGE,
    );

    if (roomBelow >= MIN_CARD) {
      card = {
        top: hole.top + hole.height + GAP,
        left: centredLeft,
        maxHeight: roomBelow,
      };
    } else if (roomAbove >= MIN_CARD) {
      card = {
        bottom: vh - hole.top + GAP,
        left: centredLeft,
        maxHeight: roomAbove,
      };
    } else if (roomLeft >= CARD_W) {
      card = {
        top: EDGE,
        left: hole.left - GAP - CARD_W,
        maxHeight: vh - EDGE * 2,
      };
    } else if (roomRight >= CARD_W) {
      card = {
        top: EDGE,
        left: hole.left + hole.width + GAP,
        maxHeight: vh - EDGE * 2,
      };
    }
    // Nothing fits anywhere: fall through to the centred card below.
  }

  // Count by what the reader will actually see, not by position in the array.
  // An optional step with nothing to point at is skipped, and numbering it
  // anyway makes the counter jump — "10 of 18" straight to "12 of 18" — which
  // reads as a stop having gone missing. Both halves shrink together instead.
  const visible = steps.filter((s) => !(s.optional && !findTarget(s)));
  const total = visible.length;
  const position = step ? visible.indexOf(step) + 1 : 0;
  const panel = 'fixed bg-neutral-950/60 dark:bg-neutral-950/75';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Site tour"
      className="fixed inset-0 z-50"
    >
      {hole ? (
        <>
          <div
            className={panel}
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }}
          />
          <div
            className={panel}
            style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className={panel}
            style={{
              top: hole.top,
              left: 0,
              width: Math.max(0, hole.left),
              height: hole.height,
            }}
          />
          <div
            className={panel}
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
            }}
          />
          <div
            className="pointer-events-none fixed rounded-lg ring-2 ring-blue-500 dark:ring-blue-400"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      ) : (
        <div className={`${panel} inset-0`} />
      )}

      <div
        className={
          card
            ? 'fixed w-[340px] rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900'
            : narrow
              ? // Docked to whichever edge the target isn't near. The step
                // walkthrough on a phone *is* a bar across the bottom, so a
                // card that always docked there would sit on top of the thing
                // it is pointing at.
                `fixed right-3 left-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 ${
                  hole && hole.top > vh / 2 ? 'top-3' : 'bottom-3'
                }`
              : 'fixed top-1/2 left-1/2 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900'
        }
        style={card ? { ...card, overflowY: 'auto' } : undefined}
      >
        <div className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
          {position || (index ?? 0) + 1} of {total}
        </div>
        <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {step.title}
        </h2>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {step.body.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            // pointerdown, not click: taps on a phone want to land on the
            // press, the way every other control on this site does.
            onPointerDown={stop}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            {(index ?? 0) > 0 && (
              <button
                type="button"
                onPointerDown={() => move(-1)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onPointerDown={() => move(1)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              {position === total ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
