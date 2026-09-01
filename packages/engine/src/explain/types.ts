/**
 * The shape one narration beat takes once built. Deliberately plain data (no
 * engine classes, no frozen Steps): beats are serialized into Postgres as a
 * teaching puzzle's `step_data` by `@sudoku/db`'s seed, and built on the fly in
 * the browser by the solver page. Both consumers get the same sentences from
 * the same templates — that is the whole point of this module living in the
 * engine rather than next to either one.
 */
export interface ExplainBeat {
  technique: string;
  /** The beat's narration, with cell names and digits already filled in. */
  explanation: string;
  /**
   * 81-char placed-digit string for the position this beat is read against.
   * Set by the Learn seed when lead-up moves had to be applied to reach the
   * pattern; the solver leaves it unset (its board is already at that
   * position).
   */
  gridBefore?: string;
  /** Cumulative highlight groups revealed by the end of this beat. */
  highlights?: { role: string; cells: number[]; digits?: number[] }[];
  /** Empty until the final beat, which carries the step's real ones. */
  placements?: { cell: number; digit: number }[];
  eliminations?: { cell: number; digit: number }[];
  /** Cell-to-cell pointers — see the engine's `Arrow`. */
  arrows?: { from: number; to: number }[];
  /** Link lines: solid for a strong link ("not one → the other"), dashed for a
   * weak one ("not both"). */
  xLines?: { from: number; to: number; style?: 'solid' | 'dashed' }[];
}
