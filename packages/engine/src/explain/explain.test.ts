import { describe, expect, it } from 'vitest';
import { parseGrid } from '../candidates.js';
import { replay, solveAll, TECHNIQUES } from '../solver.js';
import { makeStep, type Step } from '../step.js';
import { lessonSlugFor, techniqueName, techniqueTier } from './names.js';
import { summarizeStep } from './summary.js';
import { explainStep } from './walkthrough.js';

/** A spread of puzzles chosen to fire well past the singles — the harder ones
 * reach the wings, fish, coloring and the forcing-chain backstop. The ones
 * from `hard17.csv` are there for the solver-only techniques. */
const PUZZLES = [
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
  '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
  '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
  '000000012000035000000600070700000300000400800100000000000120000080000040050000600',
  // Empty Rectangle.
  '000000000000001023004056000000007000000200001006000500000800600030000000120900000',
  // WXYZ-Wing (wxyzwing.csv).
  '000004700500370060230000004700030840000401000084060003300000059070093002006200000',
  // Unique Rectangle Types 2, 3, 4 and 6, and Hidden Rectangle.
  '000000001000000020003004000000005300010000600270000000000080000000120030004700900',
  '000000000000001002034000050000000600000050340200000000000002107040800000056000000',
  '000000000000000012003004000000012000000305000060000007000700830050000400290000000',
  '000000001000002030004005000000000560070000000310080000000010400005000200060300000',
  '000000000000001002003000040000002000000056000001000370000300800060400000920000600',
];

/** Every (step, grid-it-fired-on) pair across the sample solves. */
function everyStep(): { step: Step; grid: ReturnType<typeof parseGrid> }[] {
  const out: { step: Step; grid: ReturnType<typeof parseGrid> }[] = [];
  for (const p of PUZZLES) {
    const { steps } = solveAll(parseGrid(p));
    steps.forEach((step, i) => {
      out.push({ step, grid: replay(p, steps.slice(0, i)) });
    });
  }
  return out;
}

describe('explainStep', () => {
  const all = everyStep();

  it('narrates every step of a real solve', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const { step, grid } of all) {
      const beats = explainStep(step, grid);
      expect(beats.length, step.technique).toBeGreaterThan(1);
      for (const b of beats) {
        expect(b.explanation.trim(), step.technique).not.toBe('');
        // Narration is prose, not the engine's set notation.
        expect(b.explanation, step.technique).not.toMatch(/[{}]/);
      }
    }
  });

  it('hangs the step’s real effect on the last beat only', () => {
    for (const { step, grid } of all) {
      const beats = explainStep(step, grid);
      const last = beats[beats.length - 1]!;
      expect(last.placements).toEqual(step.placements.map((p) => ({ ...p })));
      expect(last.eliminations).toEqual(step.eliminations.map((e) => ({ ...e })));
      for (const b of beats.slice(0, -1)) {
        expect(b.placements).toEqual([]);
        expect(b.eliminations).toEqual([]);
      }
    }
  });

  it('covers every technique the solver can apply', () => {
    // Techniques exercised by the sample above, plus the two ids only the
    // solver page can produce (a promoted user-notes step, and the teaching
    // relabels' underlying id).
    const seen = new Set(all.map((a) => a.step.technique));
    expect(seen.size).toBeGreaterThan(10);
    // The registered set is the 28 curriculum techniques, the solver-only ones,
    // and the forcing-chain backstop; every one of them must narrate without
    // hitting the fallback. Bump this when a technique is added.
    expect(TECHNIQUES.length).toBe(37);
  });

  it('narrates a promoted user-notes step', () => {
    const grid = parseGrid(PUZZLES[0]!);
    const step = makeStep({
      technique: 'user-notes',
      eliminations: [
        { cell: 2, digit: 1 },
        { cell: 2, digit: 2 },
      ],
      highlights: [{ role: 'elimination', cells: [2] }],
      description: 'Your notes',
    });
    const beats = explainStep(step, grid);
    expect(beats.length).toBeGreaterThan(1);
    expect(beats[0]!.explanation).toContain('2 candidates');
  });

  it('falls back to the engine description for an unknown technique', () => {
    const grid = parseGrid(PUZZLES[0]!);
    const step = makeStep({
      technique: 'brand-new-technique',
      eliminations: [{ cell: 5, digit: 4 }],
      highlights: [{ role: 'elimination', cells: [5], digits: [4] }],
      description: 'Something the narration does not know about yet.',
    });
    const beats = explainStep(step, grid);
    expect(beats[0]!.explanation).toBe(
      'Something the narration does not know about yet.',
    );
    expect(beats[beats.length - 1]!.eliminations).toEqual([{ cell: 5, digit: 4 }]);
  });
});

describe('summarizeStep', () => {
  it('states a placement as the cell taking a digit', () => {
    const step = makeStep({
      technique: 'naked-single',
      placements: [{ cell: 0, digit: 7 }],
      description: '',
    });
    expect(summarizeStep(step)).toBe('r1c1 must be 7');
  });

  it('groups one digit leaving several cells', () => {
    const step = makeStep({
      technique: 'x-wing',
      eliminations: [
        { cell: 0, digit: 9 },
        { cell: 9, digit: 9 },
      ],
      description: '',
    });
    expect(summarizeStep(step)).toBe('removes 9 from r1c1 and r2c1');
  });

  it('groups several digits leaving one cell', () => {
    const step = makeStep({
      technique: 'unique-rectangle',
      eliminations: [
        { cell: 4, digit: 2 },
        { cell: 4, digit: 6 },
      ],
      description: '',
    });
    expect(summarizeStep(step)).toBe('removes 2 and 6 from r1c5');
  });

  it('abbreviates a wide elimination', () => {
    const step = makeStep({
      technique: 'claiming',
      eliminations: [0, 1, 2, 3, 4].map((cell) => ({ cell, digit: 3 })),
      description: '',
    });
    expect(summarizeStep(step)).toBe('removes 3 from r1c1, r1c2, r1c3 and 2 more');
  });

  it('never leaks the engine’s set notation', () => {
    for (const { step } of everyStep()) {
      expect(summarizeStep(step), step.technique).not.toMatch(/[{}]/);
    }
  });
});

describe('techniqueName', () => {
  it('names every technique the solver registers', () => {
    for (const { step } of everyStep()) {
      const name = techniqueName(step.technique);
      // A mapped display name, never the raw technique id.
      expect(name, step.technique).not.toBe(step.technique);
      expect(name, step.technique).toMatch(/^[A-Z0-9]/);
    }
  });

  it('title-cases an unmapped id rather than throwing', () => {
    expect(techniqueName('brand-new-technique')).toBe('Brand New Technique');
  });

  it('points a technique at the lesson that teaches it', () => {
    expect(lessonSlugFor('xy-wing')).toBe('xy-wing');
    // Two engine techniques, one merged lesson.
    expect(lessonSlugFor('claiming')).toBe('pointing');
    // Taught under its two beginner-friendly names, not its formal one.
    expect(lessonSlugFor('hidden-single')).toBe('cross-hatching');
    expect(lessonSlugFor('forcing-chain')).toBeNull();
    // Solver-only: named and tiered, but no lesson to link to.
    expect(lessonSlugFor('empty-rectangle')).toBeNull();
    expect(lessonSlugFor('hidden-rectangle')).toBeNull();
    expect(lessonSlugFor('user-notes')).toBeNull();
  });
});

describe('techniqueTier', () => {
  it('places every curriculum technique in the tier its lesson sits in', () => {
    for (const { step } of everyStep()) {
      if (step.technique === 'forcing-chain') continue; // not a pattern
      expect(techniqueTier(step.technique), step.technique).not.toBeNull();
    }
    expect(techniqueTier('naked-single')).toBe('beginner');
    expect(techniqueTier('hidden-single')).toBe('beginner');
    expect(techniqueTier('x-wing')).toBe('intermediate');
    expect(techniqueTier('claiming')).toBe('intermediate');
    expect(techniqueTier('bug+1')).toBe('advanced');
    expect(techniqueTier('als-xz')).toBe('master');
  });

  it('leaves the non-curriculum ids untiered', () => {
    expect(techniqueTier('forcing-chain')).toBeNull();
    expect(techniqueTier('user-notes')).toBeNull();
    expect(techniqueTier('given')).toBeNull();
  });
});
