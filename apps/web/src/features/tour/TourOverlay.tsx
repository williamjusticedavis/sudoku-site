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

/** How long after arriving at a stop the overlay keeps correcting the scroll.
 * Long enough to cover a toolbar collapse and the reflow behind it, short
 * enough to be over before anyone has decided to scroll for themselves. */
const SETTLE_MS = 500;

/** How long after a tour button is pressed its trailing click is eaten. Long
 * enough to cover the gap between pointerdown and the click on a touchscreen,
 * short enough not to swallow a deliberate second tap. */
const SWALLOW_MS = 350;

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

/** The visible band. On a phone `innerWidth`/`innerHeight` lag a toolbar
 * transition, so ask `visualViewport` where it exists — the card is the one
 * `position: fixed` part of this overlay and has to fit what's actually on
 * screen. */
function viewport() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

/** The target's box in *document* coordinates, plus the page metrics the
 * overlay is drawn against. */
interface Metrics {
  rect: Rect | null;
  scrollX: number;
  scrollY: number;
  docW: number;
  docH: number;
  vw: number;
  vh: number;
}

/**
 * Document coordinates, not viewport ones, and that is the whole point.
 *
 * The spotlight has to sit on a control to the pixel, and a phone gives you two
 * viewports to get that wrong with: `getBoundingClientRect()` answers against
 * the layout viewport, while Safari re-anchors `position: fixed` to the visual
 * one — and the gap between the two opens and closes as the browser toolbars
 * slide in and out, including in response to the tour's own scrolling. Two
 * attempts to convert between them were two different guesses about behaviour
 * that varies by browser and by moment, and both left rings sitting a toolbar's
 * height off their target.
 *
 * So the ring and its dimming panels don't live in a viewport at all. They are
 * `position: absolute` at `rect.top + scrollY` — ordinary page content, pinned
 * to the document beside the thing they're ringing. They move with it because
 * they are in the same coordinate space as it, and no conversion is involved at
 * any point. The card stays `fixed`, because its job is to stay in view rather
 * than to line up with anything.
 */
function measurePage(el: HTMLElement | null): Metrics {
  const de = document.documentElement;
  const vp = viewport();
  const r = el?.getBoundingClientRect();
  return {
    rect: r
      ? {
          top: r.top + window.scrollY,
          left: r.left + window.scrollX,
          width: r.width,
          height: r.height,
        }
      : null,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    docW: Math.max(de.scrollWidth, vp.width),
    docH: Math.max(de.scrollHeight, vp.height),
    vw: vp.width,
    vh: vp.height,
  };
}

function sameMetrics(a: Metrics | null, b: Metrics): boolean {
  if (!a) return false;
  const ra = a.rect;
  const rb = b.rect;
  if (!ra !== !rb) return false;
  if (
    ra &&
    rb &&
    (ra.top !== rb.top ||
      ra.left !== rb.left ||
      ra.width !== rb.width ||
      ra.height !== rb.height)
  )
    return false;
  return (
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.docW === b.docW &&
    a.docH === b.docH &&
    a.vw === b.vw &&
    a.vh === b.vh
  );
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

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [ready, setReady] = useState(false);
  const steps = tour ? stepsFor(tour) : [];
  const step = index === null ? null : steps[index];
  /** Which way the reader is walking, so a skipped step is stepped *over*
   * rather than bouncing them back the way they came. */
  const dir = useRef(1);
  /** Until when the tracking loop may re-scroll a target that has drifted out
   * of view. Scrolling is not a one-shot on a phone: collapsing or expanding
   * the browser toolbars after the fact reflows the visible band and can leave
   * a target that was centred a moment ago off the top of it. Re-asserting for
   * a short window catches that; bounding the window keeps it from fighting a
   * reader who scrolls the page themselves. */
  const settleUntil = useRef(0);
  /** The card, so the scroll lock below can let a long one scroll while the
   * page behind it stays put. */
  const cardRef = useRef<HTMLDivElement | null>(null);
  /** Until when a click is eaten before it can reach the page. See `press`. */
  const swallowUntil = useRef(0);
  /** Whether the shield that absorbs that click is up. Also see `press`. */
  const [shielded, setShielded] = useState(false);
  const shieldTimer = useRef<number | null>(null);

  // Find the step's target once we're on its page, scroll it into view, and
  // decide what to do when it never turns up.
  useEffect(() => {
    if (!step) return;
    setReady(false);
    setMetrics(null);
    if (!step.target) {
      setMetrics(measurePage(null));
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
        settleUntil.current = performance.now() + SETTLE_MS;
        setMetrics(measurePage(el));
        setReady(true);
        return;
      }
      if (performance.now() > deadline) {
        // Optional steps describe controls that only exist in some states —
        // an empty grid has no step list. Step over them.
        if (step.optional && index !== null) skip(index, dir.current || 1);
        else {
          setMetrics(measurePage(null)); // centred card; the copy stands alone
          setReady(true);
        }
        return;
      }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [step, index, skip]);

  // Re-read the page every frame for as long as the tour is up. One
  // `getBoundingClientRect` per frame, and it means a layout shift, a font
  // arriving, an orientation change — anything at all — can't leave the ring
  // behind the element it was drawn around.
  useEffect(() => {
    if (!active || !ready) return;
    let raf = 0;
    const measure = () => {
      const el = step?.target ? findTarget(step) : null;
      // The target blinked out of the DOM mid-step: hold the last known box
      // rather than tearing the ring down and rebuilding it.
      if (step?.target && !el) {
        raf = requestAnimationFrame(measure);
        return;
      }
      if (el && performance.now() < settleUntil.current) {
        // Arriving at a stop is not a one-shot scroll on a phone: a toolbar
        // sliding away afterwards reflows the visible band and can leave a
        // target that was centred a moment ago off the edge of it. Re-assert
        // briefly, then stop, so this never fights a reader.
        const r = el.getBoundingClientRect();
        const vh = viewport().height;
        if (r.top < EDGE || r.bottom > vh - EDGE)
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      const next = measurePage(el);
      setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
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

  /**
   * Wrap a tour button's action, and absorb the click that follows it.
   *
   * The buttons act on `pointerdown`, the way every other control on this site
   * does, so a tap lands on the press. But the browser still delivers a `click`
   * when the finger lifts, and it delivers it to whatever is under the finger
   * *then* — by which point this button has either moved (Next re-lays the card
   * for the new step) or gone (Done ends the tour). The click went to the page
   * behind it: finishing the Learn tour opened whichever lesson happened to sit
   * under the Done button.
   *
   * Two guards, because one wasn't enough. Cancelling the click from a
   * capture-phase listener on `window` looked sufficient and isn't — the app
   * hydrates the whole document, so the router's delegated handler navigated
   * anyway, `stopPropagation` notwithstanding. What does hold is a transparent
   * shield over the page for the same moment: the stray click's *target* is
   * then the shield rather than a link, so there is no handler to run and
   * nothing to order correctly. The card sits above the shield, so pressing
   * Next twice quickly still works.
   */
  const press = useCallback(
    (action: () => void) => () => {
      swallowUntil.current = performance.now() + SWALLOW_MS;
      setShielded(true);
      if (shieldTimer.current !== null) window.clearTimeout(shieldTimer.current);
      shieldTimer.current = window.setTimeout(() => {
        shieldTimer.current = null;
        setShielded(false);
      }, SWALLOW_MS);
      action();
    },
    [],
  );

  useEffect(
    () => () => {
      if (shieldTimer.current !== null) window.clearTimeout(shieldTimer.current);
    },
    [],
  );

  useEffect(() => {
    const swallow = (e: MouseEvent) => {
      if (performance.now() > swallowUntil.current) return;
      swallowUntil.current = 0; // one click, not everything for the next moment
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', swallow, true);
    return () => window.removeEventListener('click', swallow, true);
  }, []);

  // Hold the page still for the length of the tour. This is a modal dialog and
  // ought to lock the background either way, but on a phone it is also what
  // keeps the ring accurate.
  //
  // The overlay is positioned against the visual viewport while the elements it
  // rings are measured against the layout viewport, and the gap between the two
  // is `visualViewport.offsetTop` — which moves when a mobile browser collapses
  // or expands its toolbars. A *user* scroll is the only thing that does that:
  // the tour's own `scrollIntoView` never triggers the toolbar animation. So
  // taking the gesture away leaves the offset fixed for the whole walk, and a
  // step can't be left ringing where its target used to be.
  //
  // Gestures, not scrolling: `overflow: hidden` on the document would stop the
  // tour reaching its own targets, and the iOS workaround for it (pinning the
  // body with `position: fixed`) relays the page out from under the ring. Non-
  // passive `touchmove`/`wheel` handlers block the input instead and leave
  // `scrollIntoView` working normally. The card is exempt: its own content
  // scrolls when the copy is taller than the space it was given.
  useEffect(() => {
    if (!active) return;
    const block = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && cardRef.current?.contains(t)) return;
      e.preventDefault();
    };
    // The scroll keys, for the same reason. The arrows are already spoken for
    // by the walk itself, below.
    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.key === ' ' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        const t = e.target;
        if (t instanceof Node && cardRef.current?.contains(t)) return;
        e.preventDefault();
      }
    };
    const opts = { passive: false } as const;
    window.addEventListener('touchmove', block, opts);
    window.addEventListener('wheel', block, opts);
    window.addEventListener('keydown', blockKeys, true);
    return () => {
      window.removeEventListener('touchmove', block);
      window.removeEventListener('wheel', block);
      window.removeEventListener('keydown', blockKeys, true);
    };
  }, [active]);

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

  if (!active || !step || typeof document === 'undefined') {
    // The tour is over, but the click from the press that ended it has not
    // arrived yet. Keep the shield up alone until it has.
    return shielded && typeof document !== 'undefined'
      ? createPortal(
          <div aria-hidden="true" className="fixed inset-0 z-50" />,
          document.body,
        )
      : null;
  }
  // A step that points at something waits for its rect as well as its target:
  // position and content have to land in the same paint, or the card is seen
  // moving after the fact.
  if (!ready || !metrics || (step.target && !metrics.rect)) {
    // Resolving: keep the screen dimmed so the tour doesn't blink out and back
    // between stops. No ring and no card until we know where they go.
    return createPortal(
      <div className="fixed inset-0 z-50 bg-neutral-950/60 dark:bg-neutral-950/75" />,
      document.body,
    );
  }

  const { rect, scrollX, scrollY, docW, docH, vw, vh } = metrics;
  const narrow = vw < 640;

  // The cut-out, in document coordinates — where the ring and the panels go.
  const hole = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // The same cut-out in viewport coordinates. Only the card needs this: it is
  // `fixed`, so where it goes is a question about what's on screen.
  const holeV = hole
    ? { ...hole, top: hole.top - scrollY, left: hole.left - scrollX }
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

  if (holeV && !narrow) {
    const roomBelow = vh - (holeV.top + holeV.height + GAP) - EDGE;
    const roomAbove = holeV.top - GAP - EDGE;
    const roomRight = vw - (holeV.left + holeV.width + GAP) - EDGE;
    const roomLeft = holeV.left - GAP - EDGE;
    const centredLeft = Math.min(
      Math.max(EDGE, holeV.left + holeV.width / 2 - CARD_W / 2),
      vw - CARD_W - EDGE,
    );

    if (roomBelow >= MIN_CARD) {
      card = {
        top: holeV.top + holeV.height + GAP,
        left: centredLeft,
        maxHeight: roomBelow,
      };
    } else if (roomAbove >= MIN_CARD) {
      card = {
        bottom: vh - holeV.top + GAP,
        left: centredLeft,
        maxHeight: roomAbove,
      };
    } else if (roomLeft >= CARD_W) {
      card = {
        top: EDGE,
        left: holeV.left - GAP - CARD_W,
        maxHeight: vh - EDGE * 2,
      };
    } else if (roomRight >= CARD_W) {
      card = {
        top: EDGE,
        left: holeV.left + holeV.width + GAP,
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
  const panel = 'absolute bg-neutral-950/60 dark:bg-neutral-950/75';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Site tour"
      // Absolute and document-sized, so everything inside is positioned in
      // document coordinates. See `measurePage` for why that matters.
      className="absolute top-0 left-0 z-50"
      style={{ width: docW, height: docH }}
    >
      {hole ? (
        <>
          <div
            className={panel}
            style={{ top: 0, left: 0, width: docW, height: Math.max(0, hole.top) }}
          />
          <div
            className={panel}
            style={{
              top: hole.top + hole.height,
              left: 0,
              width: docW,
              height: Math.max(0, docH - (hole.top + hole.height)),
            }}
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
              width: Math.max(0, docW - (hole.left + hole.width)),
              height: hole.height,
            }}
          />
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-blue-500 dark:ring-blue-400"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-neutral-950/60 dark:bg-neutral-950/75" />
      )}

      {shielded && <div aria-hidden="true" className="fixed inset-0" />}

      <div
        ref={cardRef}
        className={
          card
            ? 'fixed w-[340px] rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900'
            : narrow
              ? // Docked to whichever edge the target isn't near. The step
                // walkthrough on a phone *is* a bar across the bottom, so a
                // card that always docked there would sit on top of the thing
                // it is pointing at.
                // `max-h`/`overflow-y-auto`: the page behind is held still for
                // the length of the tour, so a card with more copy than screen
                // has to carry its own scroll or the buttons under it can't be
                // reached at all.
                `fixed right-3 left-3 max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 ${
                  hole && hole.top > vh / 2 ? 'top-3' : 'bottom-3'
                }`
              : 'fixed top-1/2 left-1/2 max-h-[calc(100vh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900'
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
            onPointerDown={press(stop)}
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            {(index ?? 0) > 0 && (
              <button
                type="button"
                onPointerDown={press(() => move(-1))}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onPointerDown={press(() => move(1))}
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
