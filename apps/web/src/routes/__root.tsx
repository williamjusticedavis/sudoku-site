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

const navLink =
  'rounded-md px-2.5 py-1 text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100';
const navLinkActive = `${navLink} bg-neutral-900 font-semibold text-white hover:bg-neutral-900 hover:text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-100 dark:hover:text-neutral-900`;

function SiteHeader() {
  return (
    <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-[1800px] items-center gap-2 px-4 py-2">
        <Link
          to="/"
          className={navLink}
          activeProps={{ className: navLinkActive }}
          activeOptions={{ exact: true }}
        >
          Solver
        </Link>
        <Link to="/learn" className={navLink} activeProps={{ className: navLinkActive }}>
          Learn
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
