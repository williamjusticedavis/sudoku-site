import { relative } from 'node:path';

// Map a repo-relative path prefix to its workspace package name.
const PACKAGE_DIRS = [
  ['packages/engine', '@sudoku/engine'],
  ['packages/db', '@sudoku/db'],
  ['apps/web', '@sudoku/web'],
  ['apps/api', '@sudoku/api'],
];

/** Which workspace packages do the staged files belong to? */
function affectedPackages(files) {
  const cwd = process.cwd();
  const pkgs = new Set();
  for (const file of files) {
    const rel = relative(cwd, file);
    const hit = PACKAGE_DIRS.find(([dir]) => rel.startsWith(dir + '/'));
    if (hit) pkgs.add(hit[1]);
  }
  return [...pkgs];
}

export default {
  // Format everything Prettier understands (files are appended by lint-staged).
  '*.{js,jsx,ts,tsx,json,md,yml,yaml,css}': ['prettier --write'],

  // Lint + autofix JS/TS.
  '*.{js,jsx,ts,tsx}': ['eslint --fix'],

  // Typecheck each touched workspace package as a whole (tsc --noEmit ignores
  // file arguments when run with -p, so we run the package's own typecheck
  // script rather than appending file names). Blocks the commit on any error.
  '*.{ts,tsx}': (files) =>
    affectedPackages(files).map((pkg) => `pnpm --filter ${pkg} typecheck`),
};
