import type { ReactNode } from 'react';
import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useNavigate,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import { ThemeToggle } from '../features/theme/ThemeToggle.js';
import { TourProvider, useTour } from '../features/tour/TourProvider.js';
import { homeFor, tourFor } from '../features/tour/steps.js';
import { TourOverlay } from '../features/tour/TourOverlay.js';
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

// Which tab is highlighted is decided here from the pathname, not from the
// `data-status="active"` attribute TanStack Link sets. Link's own matching is
// prefix-based, which used to light two tabs at once back when the `?` was a
// link to `/learn/basics`. The `?` now starts a tour instead of owning a route,
// so Learn simply covers `/learn` and everything under it — including the
// basics page, which is reached from a card inside Learn.
function isLearnActive(pathname: string) {
  return pathname === '/learn' || pathname.startsWith('/learn/');
}

// Idle and active are separate, complete class strings rather than one string
// with `data-[status=active]:` overrides layered on top. An active tab that
// still carried the idle `hover:` classes hit the earlier bug where the idle
// and active rules set the same property in the same variant and stylesheet
// order picked the wrong one. The active strings simply have no `hover:` rules,
// so an active tab holds its colours on hover.
const navBase = 'rounded-md px-2.5 py-1 text-sm font-medium transition-colors';
const navIdle = [
  navBase,
  'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
  'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
].join(' ');
const navActive = [
  navBase,
  'bg-neutral-900 font-semibold text-white',
  'dark:bg-neutral-100 dark:text-neutral-900',
].join(' ');

const helpBase =
  'ml-3 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors';
const helpIdle = [
  helpBase,
  'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-900',
  'dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100',
].join(' ');
const helpActive = [
  helpBase,
  'border-neutral-900 bg-neutral-900 text-white',
  'dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900',
].join(' ');

function SiteHeader() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const solverActive = pathname === '/';
  const learnActive = isLearnActive(pathname);
  const tour = useTour();
  const navigate = useNavigate();

  // Each tour describes one screen, so the `?` runs whichever belongs to where
  // you already are — the solver, the Learn index, or the lesson you have open.
  // Only the Learn index tour names a page it has to be run from, and only the
  // two prose pages under /learn fall back to it; that move happens before any
  // card is on screen rather than in the middle of a walk.
  const startTour = () => {
    const which = tourFor(pathname);
    const home = homeFor(which);
    if (home && pathname !== home) void navigate({ to: home });
    tour.start(which);
  };

  return (
    <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-[1800px] items-center gap-2 px-4 py-2">
        {/* `activeOptions={{ exact: true }}` everywhere is about more than the
            styling above: Link stamps its own `aria-current="page"` from the
            same prefix match, and that can't be overridden from outside — with
            the default (prefix) matching, `/learn/basics` got `aria-current` on
            both the Learn tab and the `?`. Exact matching narrows Link's own
            attribute to the one path it really owns; where a tab should read as
            current for a *child* route (a lesson under Learn) the `aria-current`
            prop below fills in, since Link leaves it alone when inactive. */}
        <Link
          to="/"
          activeOptions={{ exact: true }}
          data-tour="nav-solver"
          className={solverActive ? navActive : navIdle}
          aria-current={solverActive ? 'page' : undefined}
        >
          Solver
        </Link>
        <Link
          to="/learn"
          activeOptions={{ exact: true }}
          data-tour="nav-learn"
          className={learnActive ? navActive : navIdle}
          aria-current={learnActive ? 'page' : undefined}
        >
          Learn
        </Link>
        {/* Not a link any more: this walks the real page rather than
            describing it on a page of its own. There is one tour per area and
            this starts the one for wherever you are, so the label is about
            this page, not the site. */}
        <button
          type="button"
          aria-label="What's on this page"
          title="What's on this page"
          aria-pressed={tour.active}
          onPointerDown={tour.active ? tour.stop : startTour}
          className={tour.active ? helpActive : helpIdle}
        >
          ?
        </button>
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
        {/* Above the outlet because the header owns the button that starts a
            tour while the pages own the things it points at. */}
        <TourProvider>
          <SiteHeader />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <TourOverlay />
        </TourProvider>
        <Scripts />
      </body>
    </html>
  );
}
