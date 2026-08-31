import type { ReactNode } from 'react';
import {
  Link,
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import { ThemeToggle } from '../features/theme/ThemeToggle.js';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Sudoku Solver' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

// One className string per link instead of className + activeProps. TanStack
// Link appends activeProps.className rather than replacing, so an active tab
// carried both `dark:hover:bg-neutral-800` (idle) and `dark:hover:bg-neutral-100`
// (active) — same property, same variant — and Tailwind's stylesheet order
// picked the dark one, so the current page's tab went near-black on hover.
// The `data-[status=active]:` compound variants below key off the
// `data-status="active"` attribute Link sets, and their selectors carry an
// extra attribute qualifier, so they outrank the plain `:hover` rules by
// specificity regardless of source order.
const navLink = [
  'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
  'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
  'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
  'data-[status=active]:bg-neutral-900 data-[status=active]:font-semibold data-[status=active]:text-white',
  'data-[status=active]:hover:bg-neutral-900 data-[status=active]:hover:text-white',
  'dark:data-[status=active]:bg-neutral-100 dark:data-[status=active]:text-neutral-900',
  'dark:data-[status=active]:hover:bg-neutral-100 dark:data-[status=active]:hover:text-neutral-900',
].join(' ');

const helpLink = [
  'ml-3 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
  'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-900',
  'dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100',
  'data-[status=active]:border-neutral-900 data-[status=active]:bg-neutral-900 data-[status=active]:text-white',
  'data-[status=active]:hover:text-white',
  'dark:data-[status=active]:border-neutral-100 dark:data-[status=active]:bg-neutral-100 dark:data-[status=active]:text-neutral-900',
  'dark:data-[status=active]:hover:text-neutral-900',
].join(' ');

function SiteHeader() {
  return (
    <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-[1800px] items-center gap-2 px-4 py-2">
        <Link to="/" className={navLink} activeOptions={{ exact: true }}>
          Solver
        </Link>
        <Link to="/learn" className={navLink}>
          Learn
        </Link>
        <Link
          to="/learn/basics"
          aria-label="How sudoku works"
          title="How sudoku works"
          className={helpLink}
        >
          ?
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

// Set the theme class before first paint so there's no flash. Reads a saved
// choice, else falls back to the OS preference.
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The boot script sets `class="dark"` on <html> before React hydrates, so
    // the server (no class) and client (class) markup differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
