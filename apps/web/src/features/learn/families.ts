/**
 * Technique families — separate lessons that share one underlying engine
 * technique and get a shared visual grouping in the tier layout (dashed
 * outline + a one-line label above the pair). See CLAUDE.md "Technique
 * families".
 */
export interface Family {
  label: string;
  slugs: string[];
}

export const FAMILIES: Family[] = [
  {
    label: 'Two ways to spot a hidden single',
    slugs: ['cross-hatching', 'last-possible-number'],
  },
];

/** The family a tactic belongs to, or undefined. */
export function familyFor(slug: string): Family | undefined {
  return FAMILIES.find((f) => f.slugs.includes(slug));
}
