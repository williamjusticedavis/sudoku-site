import type { Tier } from './types.js';

/**
 * Per-tier tint: a cool→warm progression from Beginner to Master. Shared by the
 * Learn overview and the lesson page so a tier reads as the same colour
 * wherever you meet it — the point of the colour is that a learner can tell
 * which level they're in without reading the label.
 *
 * Class strings are spelled out in full rather than interpolated from the tier
 * name, because Tailwind scans source text and would never emit a class it
 * can't see written down.
 */
export interface TierAccent {
  /** Tier name as a heading, and the tier-coloured label on a nav link. */
  heading: string;
  /** The horizontal rule under a tier heading / lesson title. */
  rule: string;
  /** Progress bar fill. */
  bar: string;
  /** Tactic card: border plus its hover state. */
  card: string;
  /** Dashed wrapper around a technique family. */
  family: string;
  familyLabel: string;
  /** Small filled pill carrying the tier name. */
  chip: string;
  /** Edge stripe + hover tint on a previous/next lesson link. Tinted by the
   * tier of the lesson being linked *to*, not the one being viewed, so
   * crossing a tier boundary is visible before you click. */
  nav: string;
}

export const TIER_ACCENT: Record<Tier, TierAccent> = {
  beginner: {
    heading: 'text-emerald-700 dark:text-emerald-400',
    rule: 'bg-emerald-500/60',
    bar: 'bg-emerald-500',
    card: 'border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/60 dark:border-emerald-800 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/30',
    family: 'border-emerald-300 dark:border-emerald-800/80',
    familyLabel: 'text-emerald-700/80 dark:text-emerald-400/80',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
    nav: 'border-emerald-400 hover:bg-emerald-50 dark:border-emerald-700 dark:hover:bg-emerald-950/30',
  },
  intermediate: {
    heading: 'text-sky-700 dark:text-sky-400',
    rule: 'bg-sky-500/60',
    bar: 'bg-sky-500',
    card: 'border-sky-300 hover:border-sky-500 hover:bg-sky-50/60 dark:border-sky-800 dark:hover:border-sky-600 dark:hover:bg-sky-950/30',
    family: 'border-sky-300 dark:border-sky-800/80',
    familyLabel: 'text-sky-700/80 dark:text-sky-400/80',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300',
    nav: 'border-sky-400 hover:bg-sky-50 dark:border-sky-700 dark:hover:bg-sky-950/30',
  },
  advanced: {
    heading: 'text-amber-700 dark:text-amber-400',
    rule: 'bg-amber-500/60',
    bar: 'bg-amber-500',
    card: 'border-amber-300 hover:border-amber-500 hover:bg-amber-50/60 dark:border-amber-800 dark:hover:border-amber-600 dark:hover:bg-amber-950/30',
    family: 'border-amber-300 dark:border-amber-800/80',
    familyLabel: 'text-amber-700/80 dark:text-amber-400/80',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
    nav: 'border-amber-400 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-950/30',
  },
  master: {
    heading: 'text-rose-700 dark:text-rose-400',
    rule: 'bg-rose-500/60',
    bar: 'bg-rose-500',
    card: 'border-rose-300 hover:border-rose-500 hover:bg-rose-50/60 dark:border-rose-800 dark:hover:border-rose-600 dark:hover:bg-rose-950/30',
    family: 'border-rose-300 dark:border-rose-800/80',
    familyLabel: 'text-rose-700/80 dark:text-rose-400/80',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300',
    nav: 'border-rose-400 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-950/30',
  },
};
