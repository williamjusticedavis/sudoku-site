import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { stepsFor, type TourId } from './steps.js';

interface TourValue {
  /** Which tour is running, or null when none is. */
  tour: TourId | null;
  /** Index into the running tour's steps, or null when none is running. */
  index: number | null;
  active: boolean;
  /** Begin a tour at its first step. */
  start(tour: TourId): void;
  stop(): void;
  /** Move by ±1, ending the tour when it walks off either end. */
  go(delta: number): void;
  /** Jump to an absolute index, ending the tour if it falls off either end. */
  goTo(index: number): void;
  /** Step past an optional step whose target isn't on this screen. Guarded by
   * the index it was scheduled for: the search that triggers it runs over
   * several frames, and a reader pressing Next in the meantime has already
   * moved on — without the guard that press and this skip both land on the
   * same step, and one of the two is silently eaten. */
  skip(from: number, delta: number): void;
}

const TourContext = createContext<TourValue | null>(null);

/** Tour state lives above the router outlet because the header owns the button
 * that starts it while the pages own the things it points at. Each tour stays
 * on one page, so this no longer has to survive a navigation mid-walk — but it
 * does have to be reachable from both sides. */
export function TourProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ tour: TourId; index: number } | null>(null);

  const start = useCallback((tour: TourId) => setState({ tour, index: 0 }), []);
  const stop = useCallback(() => setState(null), []);

  /** Every move funnels through here: `null` when the new index falls off
   * either end, which is what ends the tour. */
  const settle = useCallback(
    (s: { tour: TourId; index: number } | null, next: number) => {
      if (!s) return null;
      return next < 0 || next >= stepsFor(s.tour).length ? null : { ...s, index: next };
    },
    [],
  );

  const go = useCallback(
    (delta: number) => setState((s) => (s ? settle(s, s.index + delta) : null)),
    [settle],
  );

  const goTo = useCallback((next: number) => setState((s) => settle(s, next)), [settle]);

  const skip = useCallback(
    (from: number, delta: number) =>
      setState((s) => {
        if (!s || s.index !== from) return s; // the reader moved on; this is stale
        return settle(s, from + delta);
      }),
    [settle],
  );

  const value = useMemo<TourValue>(
    () => ({
      tour: state?.tour ?? null,
      index: state?.index ?? null,
      active: state !== null,
      start,
      stop,
      go,
      goTo,
      skip,
    }),
    [state, start, stop, go, goTo, skip],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside a TourProvider');
  return ctx;
}
