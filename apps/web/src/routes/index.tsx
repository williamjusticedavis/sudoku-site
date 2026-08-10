import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { parseGrid, serializeGrid, solveAll } from '@sudoku/engine';

export const Route = createFileRoute('/')({ component: Home });

// A known puzzle; the solver runs entirely in the browser on click.
const SAMPLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

interface Solved {
  status: string;
  steps: number;
  grid: string;
}

function Home() {
  const [result, setResult] = useState<Solved | null>(null);

  function runSolve() {
    // This handler runs client-side — proof the framework-free engine works
    // in the browser with no server round-trip.
    const grid = parseGrid(SAMPLE);
    const r = solveAll(grid);
    setResult({ status: r.status, steps: r.steps.length, grid: serializeGrid(grid) });
  }

  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: 24, lineHeight: 1.5 }}>
      <h1>@sudoku/engine — client-side proof</h1>
      <p>Sample puzzle (81 chars):</p>
      <pre>{SAMPLE}</pre>
      <button
        type="button"
        onClick={runSolve}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Solve in the browser
      </button>
      {result && (
        <section style={{ marginTop: 16 }}>
          <p>
            status: <strong>{result.status}</strong> · steps applied:{' '}
            <strong>{result.steps}</strong>
          </p>
          <pre>{result.grid}</pre>
        </section>
      )}
    </main>
  );
}
