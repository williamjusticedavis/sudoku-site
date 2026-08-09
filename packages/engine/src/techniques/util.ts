/** Small combinatorics shared by subset and fish techniques. */

/** All k-combinations (as index tuples into `0..n-1`), k ≥ 1. */
export function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const combo: number[] = [];
  const rec = (start: number): void => {
    if (combo.length === k) {
      out.push(combo.slice());
      return;
    }
    for (let i = start; i <= n - (k - combo.length); i++) {
      combo.push(i);
      rec(i + 1);
      combo.pop();
    }
  };
  if (k >= 1 && k <= n) rec(0);
  return out;
}
