import type { TechniqueId } from '../step.js';

/**
 * Display names for technique ids. The solver's step list used to print the
 * raw id (`"als-xz"`, `"bug+1"`, `"2-string-kite"`), which reads as debug
 * output next to the Learn section's proper names — and worse, doesn't match
 * the name of the lesson that teaches the very same pattern. These are exactly
 * the `tactics.name` values seeded for the Learn curriculum, plus the four ids
 * with no lesson of their own.
 */
const NAMES: Record<string, string> = {
  given: 'Given',
  user: 'Your move',
  'user-notes': 'Your notes',
  'last-free-cell': 'Last Free Cell',
  'naked-single': 'Naked Single',
  'hidden-single': 'Hidden Single',
  'cross-hatching': 'Cross-Hatching',
  'last-possible-number': 'Last Possible Number',
  pointing: 'Pointing',
  claiming: 'Claiming',
  'naked-pair': 'Naked Pair',
  'naked-triple': 'Naked Triple',
  'naked-quad': 'Naked Quad',
  'hidden-pair': 'Hidden Pair',
  'hidden-triple': 'Hidden Triple',
  'hidden-quad': 'Hidden Quad',
  'x-wing': 'X-Wing',
  swordfish: 'Swordfish',
  jellyfish: 'Jellyfish',
  skyscraper: 'Skyscraper',
  '2-string-kite': '2-String Kite',
  'turbot-fish': 'Turbot Fish',
  'simple-coloring': 'Simple Coloring',
  'finned-x-wing': 'Finned X-Wing',
  'finned-swordfish': 'Finned Swordfish',
  'finned-jellyfish': 'Finned Jellyfish',
  'xy-wing': 'XY-Wing',
  'xyz-wing': 'XYZ-Wing',
  'w-wing': 'W-Wing',
  'unique-rectangle': 'Unique Rectangle',
  'bug+1': 'BUG+1',
  'xy-chain': 'XY-Chain',
  'als-xz': 'ALS-XZ',
  'forcing-chain': 'Forcing Chain',
};

/** Curriculum tier a technique is taught in — see the locked tactics table in
 * CLAUDE.md. Mirrors what `packages/db`'s seed writes to `tactics.tier`; kept
 * here too because the solver runs entirely client-side and must not reach for
 * the database to label a step. */
export type TechniqueTier = 'beginner' | 'intermediate' | 'advanced' | 'master';

const TIERS: Record<string, TechniqueTier> = {
  'last-free-cell': 'beginner',
  'naked-single': 'beginner',
  'cross-hatching': 'beginner',
  'last-possible-number': 'beginner',
  // No lesson of its own — taught as Cross-Hatching / Last Possible Number,
  // both beginner, so it reads at their level.
  'hidden-single': 'beginner',
  pointing: 'intermediate',
  claiming: 'intermediate',
  'naked-pair': 'intermediate',
  'naked-triple': 'intermediate',
  'naked-quad': 'intermediate',
  'hidden-pair': 'intermediate',
  'hidden-triple': 'intermediate',
  'hidden-quad': 'intermediate',
  'x-wing': 'intermediate',
  skyscraper: 'intermediate',
  '2-string-kite': 'advanced',
  'turbot-fish': 'advanced',
  swordfish: 'advanced',
  'xy-wing': 'advanced',
  'w-wing': 'advanced',
  'xyz-wing': 'advanced',
  'finned-x-wing': 'advanced',
  'finned-swordfish': 'advanced',
  'unique-rectangle': 'advanced',
  'bug+1': 'advanced',
  jellyfish: 'master',
  'finned-jellyfish': 'master',
  'xy-chain': 'master',
  'simple-coloring': 'master',
  'als-xz': 'master',
};

/**
 * The tier a technique is taught in, or null for the ids that aren't
 * curriculum: the forcing-chain backstop (a guided guess-and-check, not a
 * pattern anyone learns to spot), and the non-technique ids.
 */
export function techniqueTier(id: TechniqueId): TechniqueTier | null {
  return TIERS[id] ?? null;
}

/** Human-readable name for a technique id; title-cases anything unmapped. */
export function techniqueName(id: TechniqueId): string {
  return (
    NAMES[id] ??
    id
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

/**
 * The Learn lesson slug that teaches a technique, or null when none does.
 * Pointing and Claiming are two engine techniques but one merged lesson;
 * `hidden-single` is deliberately taught as Cross-Hatching / Last Possible
 * Number instead, and the forcing chain / user-notes ids aren't curriculum.
 */
export function lessonSlugFor(id: TechniqueId): string | null {
  if (id === 'claiming') return 'pointing';
  if (id === 'hidden-single') return 'cross-hatching';
  if (id === 'given' || id === 'user' || id === 'user-notes') return null;
  if (id === 'forcing-chain') return null;
  return NAMES[id] ? id : null;
}
