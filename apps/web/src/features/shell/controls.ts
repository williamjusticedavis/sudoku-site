/**
 * Class strings for the controls that appear on more than one page.
 *
 * Not a component library — just named Tailwind strings, so a button on the
 * solver and a button on the feedback form cannot drift apart in padding or
 * disabled styling. Variants that only ever appear on one page stay on that
 * page and compose from `btn` here.
 */

const base =
  'rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';

/** Default control padding, used everywhere except the lesson pages. */
export const btn = `${base} px-3 py-2`;

/** Roomier padding for lesson pages, where the button is the page's main
 * action rather than one control among many in a toolbar. */
export const btnLesson = `${base} px-5 py-2.5`;

const primary = 'bg-blue-600 text-white hover:bg-blue-500';
const ghost =
  'border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800';

export const btnPrimary = `${btn} ${primary}`;
export const btnGhost = `${btn} ${ghost}`;
export const btnLessonPrimary = `${btnLesson} ${primary}`;
export const btnLessonGhost = `${btnLesson} ${ghost}`;

/** A link sitting inside a paragraph of prose, where it needs to be visibly a
 * link without the heavier treatment the nav and card links get. */
export const inlineLink =
  'font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:decoration-blue-400';
