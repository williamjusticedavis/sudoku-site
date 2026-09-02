/** The site tours: what's on this page and where it lives.
 *
 * Deliberately *not* tutorials. Neither one asks the reader to do anything or
 * touches a puzzle they may have in progress — they point at the real controls
 * on the real page and say what each is for. The things worth a tour are the
 * ones no button label can carry on its own (that Solve and Hint are the same
 * walkthrough at different speeds; that hand-written marks get verified and
 * kept; that the step list can be scrubbed).
 *
 * There is one per screen, and each stays on the screen it describes. An
 * earlier version was a single walk that navigated from the solver into Learn
 * halfway through, which meant the reader was teleported mid-tour and the
 * machinery had to cope with targets that didn't exist yet on a page that
 * hadn't rendered. Splitting them means every step's target is on screen when
 * the tour starts, and each one ends by pointing at somewhere else rather than
 * dragging you there.
 *
 * The step list gets its own rather than a few stops inside the solver tour,
 * because it only exists after a solve — most people opening the solver tour
 * have no list to be shown. It is started from a `?` in that panel instead of
 * the one in the header.
 *
 * Targets are matched by `data-tour="<id>"` rather than a ref registry, so a
 * page opts in by adding one attribute and nothing else. A step whose target
 * is missing falls back to a centred card, unless `optional` — those are for
 * controls that only exist in some states (the step list appears once you've
 * solved something) and are stepped over instead.
 */

export interface TourStep {
  /** Stable id — also the `data-tour` value the page marks its element with. */
  id: string;
  /** Element to spotlight, matched as `[data-tour="<target>"]`. Omit for a
   * centred card with no target. */
  target?: string;
  /** Overrides the `data-tour` lookup when the element worth ringing isn't the
   * one carrying the attribute — the grid's layout wrapper fills the whole
   * column, so the ring is drawn around the board inside it instead. */
  selector?: string;
  title: string;
  /** Paragraphs. Kept as an array so the overlay doesn't parse markup. */
  body: readonly string[];
  /** Step over this one when its target isn't on screen, rather than centring. */
  optional?: boolean;
}

export type TourId = 'solver' | 'learn' | 'lesson' | 'steps';

export const SOLVER_TOUR: readonly TourStep[] = [
  {
    id: 'welcome',
    title: "What's on this page",
    body: [
      'The Solver takes any puzzle you throw at it and either finishes it or walks you through one move at a time, explaining each one as it goes.',
      "This is a look around, not a lesson — nothing here will touch a puzzle you've already got on the go. Arrow keys or the buttons below; Escape leaves at any point.",
      'Brand new to sudoku itself? The rules and the two words the lessons lean on have their own page, in Learn — the last stop points the way.',
    ],
  },
  {
    id: 'grid',
    target: 'grid',
    selector: '[data-tour="grid"] [role="grid"]',
    title: 'The grid',
    body: [
      'Click a cell and type a digit, or move around with the arrow keys. Backspace clears a cell. That is the whole of entering a puzzle by hand — but you rarely have to, which the next few stops cover.',
    ],
  },
  {
    id: 'paste',
    target: 'paste',
    title: 'Paste a puzzle',
    body: [
      'Opens a box that takes a puzzle as text — 81 characters of digits with a 0 or a dot for the blanks, in rows or in one long run. Most puzzle sites will hand you a string in that shape.',
    ],
  },
  {
    id: 'upload',
    target: 'upload',
    title: 'Or photograph one',
    body: [
      'Take a picture of a puzzle in a newspaper or a book and it reads the digits off it. You get a crop step first, to line the grid edges up, and every cell it read lands in the grid as normal — so you can fix anything it misread before solving.',
    ],
  },
  {
    id: 'example',
    target: 'example',
    title: 'Nothing to hand?',
    body: ['Loads a puzzle so you have something to press the other buttons against.'],
  },
  {
    id: 'notes',
    target: 'notes',
    title: 'Pencil marks',
    body: [
      'Notes mode turns typed digits into small pencil marks instead of placed digits — or hold Shift and type, without switching modes at all.',
      'Auto notes fills every empty cell with the digits that can still legally go there, which is where most solving actually starts.',
    ],
  },
  {
    id: 'marks-are-kept',
    target: 'solve-group',
    title: 'Your marks are checked, not thrown away',
    body: [
      "Marks you wrote yourself get verified before a solve — against what the solver works out itself, and against the puzzle's real solution. Every one of them holding up means the eliminations you already found are folded straight into the solve, so you aren't walked back through your own work.",
      'One mark that rules out a digit which genuinely belongs there voids the set: your notes reset and it solves from the placed digits instead, telling you which cell was wrong. Nothing is taken on your word, but nothing correct is wasted either.',
    ],
  },
  {
    id: 'hint',
    target: 'hint',
    title: 'One move at a time',
    body: [
      'Finds the next move and talks you through why it works — the pattern, the cells it depends on, and what it rules out — before placing anything. Press it again to read on; the last press applies the move.',
    ],
  },
  {
    id: 'solve',
    target: 'solve',
    title: 'Or all of it at once',
    body: [
      'The same machinery as Hint, at speed. Every move it makes is a real, named technique with the same explanation attached — never a guess and never a brute-force answer dropped on you. The full list is waiting afterwards.',
    ],
  },
  {
    id: 'check',
    target: 'check',
    title: 'Check for mistakes',
    body: [
      'Looks for a digit repeated in a row, column or box, a pencil mark that a placed digit already rules out, a digit with nowhere left to go in a unit, and a note set that has ruled out the digit which actually belongs in that cell.',
    ],
  },
  {
    id: 'steps',
    target: 'steps-panel',
    optional: true,
    title: 'The step list',
    body: [
      'Once a hint or a solve has run, every move lands here in order — each one a named technique, not a guess.',
      'There is more to it than a list, so it has a tour of its own: the ? in its header covers reading a move, jumping back to any point, and taking the grid over yourself.',
    ],
  },
  {
    id: 'history',
    target: 'history',
    title: 'Undo and redo',
    body: [
      "Step backwards and forwards through everything on the board, yours and the solver's alike. Cmd or Ctrl+Z, and Shift with it to redo.",
    ],
  },
  {
    id: 'to-learn',
    target: 'nav-learn',
    title: 'Also worth a look: Learn',
    body: [
      'The other half of the site. Every technique the solver uses, taught as its own lesson with a real puzzle to watch it fire on — and, at the top, a primer on the rules themselves if sudoku is new.',
      'It has a tour of its own: open Learn and press the ? again.',
    ],
  },
];

export const LEARN_TOUR: readonly TourStep[] = [
  {
    id: 'welcome',
    title: "What's on this page",
    body: [
      'Every technique as its own lesson. A lesson explains the pattern in prose, then walks a real puzzle where it fires — the same step-by-step narration the solver gives, on a grid chosen to show that one idea clearly.',
      'Three things sit on this page, and the next stops point at each: a primer for anyone new to sudoku, the lessons grouped into four tiers, and a short page on the vocabulary the chain-shaped lessons need.',
    ],
  },
  {
    id: 'learn-basics',
    target: 'learn-basics',
    title: 'Start here if the rules are new',
    body: [
      "This card, at the top, is the one to open first if you've never solved a sudoku: the single rule, what “solved” means, and the two words — unit and candidate — every lesson below it assumes you already have.",
      'It stays put at the top; nothing else in Learn depends on having read it more than once.',
    ],
  },
  {
    id: 'learn-tiers',
    target: 'learn-tiers',
    title: 'The tiers',
    body: [
      'Four of them, ordered roughly by how hard the pattern is to spot in a real grid rather than how complicated it is to describe — which is why Jellyfish sits in Master while X-Wing, the same shape at a smaller scale, is Intermediate.',
      'The count beside each tier is how many of its lessons you have finished.',
    ],
  },
  {
    id: 'learn-links',
    target: 'learn-links',
    title: 'Strong and weak links',
    body: [
      'Not a technique — the vocabulary the chain-shaped lessons are built on. It sits above the Intermediate tier because Skyscraper, the first lesson that needs it, is an Intermediate one.',
      'Read it when "strong link" first turns up and stops meaning anything.',
    ],
  },
  {
    id: 'to-solver',
    target: 'nav-solver',
    title: 'Also worth a look: the Solver',
    body: [
      'The other half of the site. Paste, photograph or type in any puzzle and it will either finish it or walk you through it one named technique at a time — the same techniques these lessons teach, on whatever grid you bring it.',
      'It has a tour of its own: open the Solver and press the ? again.',
    ],
  },
];

export const LESSON_TOUR: readonly TourStep[] = [
  {
    id: 'welcome',
    title: "What's on this page",
    body: [
      'One technique, taught on real puzzles. The first is a worked example — the lesson shows you the pattern and walks it move by move. The rest are practice: same technique, new grid, and you get a go at spotting it before asking for the walkthrough.',
      'Nothing here is timed and nothing is lost by asking for the hint.',
    ],
  },
  {
    id: 'lesson-board',
    target: 'lesson-board',
    title: 'The board',
    body: [
      'While a walkthrough is running, everything the current move does not depend on is dimmed, so the cells that matter are the ones you can see. The highlights change with each step of the explanation.',
      'Before you ask for the hint the board is yours to poke at, so you can hunt for the pattern first.',
    ],
  },
  {
    id: 'lesson-puzzles',
    target: 'lesson-puzzles',
    title: 'Which puzzle you are on',
    body: [
      'One tab per puzzle in this lesson, and a dot for each step once a walkthrough is running — so you can see how far through the explanation you are.',
      'The line below names the puzzle and says whether it is the teaching example or practice.',
    ],
  },
  {
    id: 'lesson-explain',
    target: 'lesson-explain',
    title: 'The explanation',
    body: [
      'This is the part that changes as you step. Each line covers one beat of the reasoning — the pattern, the cells it rests on, what it rules out — and the board underneath highlights exactly what the words are talking about.',
    ],
  },
  {
    id: 'lesson-controls',
    target: 'lesson-controls',
    title: 'Working through it',
    body: [
      'Show hint starts the walkthrough; from there Next reads on and Back returns a beat. The last step is Apply, which actually places the digit or clears the candidates.',
      'Then it is on to the next puzzle, and the lesson counts as done when you finish the last one.',
    ],
  },
  {
    id: 'lesson-about',
    target: 'lesson-about',
    title: 'The technique itself',
    body: [
      'A short write-up of the pattern in general, away from this particular grid — worth reading once the walkthrough has made it concrete.',
      'Technique names in here are links: the ones a lesson leans on are one click away, so you can go back and pick up a prerequisite without hunting for it.',
    ],
  },
  {
    id: 'lesson-nearby',
    target: 'lesson-nearby',
    title: 'Carrying on',
    body: [
      'The previous and next lessons in curriculum order, so you can work straight through without going back to the index between each one. These cross tier boundaries — the end of Beginner leads into the start of Intermediate.',
    ],
  },
  {
    id: 'to-learn',
    target: 'nav-learn',
    title: 'Also worth a look: the whole curriculum',
    body: [
      'The Learn index lists every lesson by tier, with a primer on the rules at the top if sudoku itself is new.',
      'It has a tour of its own: open Learn and press the ? again.',
    ],
  },
];

/** The step list's own tour, started from the ? inside that panel rather than
 * the one in the header — it describes a thing that only exists after a solve,
 * so it would be dead weight in the solver tour.
 *
 * Desktop and mobile show genuinely different controls here: the list sits
 * beside the grid on a wide screen and collapses behind a toggle on a narrow
 * one, and the narration is a panel on one and a docked bar on the other. Both
 * sets of stops are listed, all marked optional, so each screen shows only the
 * ones it actually has. */
export const STEPS_TOUR: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'The solve, step by step',
    body: [
      'Every move the solver made, in order, each one a named technique rather than a guess. This is the whole point of the thing: not the finished grid, but how it got there.',
    ],
  },
  {
    id: 'narration',
    target: 'steps-narration',
    optional: true,
    title: 'What this move is doing',
    body: [
      'The current move in plain words, one beat at a time — the pattern, the cells it depends on, and what it rules out. The board highlights whatever the current line is describing.',
      'The arrows here read back and forth through those lines without changing the board.',
    ],
  },
  {
    id: 'mobile-bar',
    target: 'steps-mobile-bar',
    optional: true,
    title: 'The bar at the bottom',
    body: [
      'On a narrow screen the walkthrough lives down here, docked below the grid, so you can read a move without scrolling away from the board it is talking about.',
      'The arrows move through the solve; the counter shows which move you are on and which line of its explanation.',
    ],
  },
  {
    id: 'mobile-toggle',
    target: 'steps-mobile-toggle',
    optional: true,
    title: 'The full list',
    body: [
      'The whole solve is folded away behind this on a narrow screen, since it is long. Open it to see every move at once and jump between them.',
    ],
  },
  {
    id: 'list',
    target: 'steps-list',
    optional: true,
    title: 'Jumping about',
    body: [
      'Click any move to put the grid back exactly as it was at that moment — the digits, the pencil marks, the highlights. Click the last one to return to the finished state.',
      'Nothing is lost by looking: jumping about is a view, not an edit, and the solve stays as it was.',
    ],
  },
  {
    id: 'takeover',
    target: 'steps-takeover',
    optional: true,
    title: 'Taking over',
    body: [
      'Keeps every digit placed so far and hands the grid back to you, with the step list out of the way — for when you wanted a nudge past a stuck point rather than the whole answer.',
    ],
  },
  {
    id: 'close',
    target: 'steps-close',
    optional: true,
    title: 'Putting it away',
    body: [
      'Closes the panel without throwing the solve away — a Steps button appears in the toolbar to bring the list back.',
    ],
  },
];

/** Which tour belongs to a path. Everything under `/learn` — the lesson pages
 * and the two explainer pages included — belongs to the Learn tour, since the
 * Learn index is where those pages are reached from. */
/** The two pages under `/learn` that are prose rather than a lesson: they have
 * no board, no puzzle tabs and nothing worth ringing, so the `?` on them offers
 * the Learn index tour instead. */
const LEARN_ARTICLES = new Set(['/learn/basics', '/learn/strong-weak-links']);

export function tourFor(pathname: string): TourId {
  if (pathname === '/learn' || LEARN_ARTICLES.has(pathname)) return 'learn';
  if (pathname.startsWith('/learn/')) return 'lesson';
  return 'solver';
}

export function stepsFor(tour: TourId): readonly TourStep[] {
  if (tour === 'learn') return LEARN_TOUR;
  if (tour === 'lesson') return LESSON_TOUR;
  if (tour === 'steps') return STEPS_TOUR;
  return SOLVER_TOUR;
}

/** The page a tour's steps live on, when starting it might need a move to get
 * there — only the Learn index tour does, since it can be asked for from one of
 * the prose pages under `/learn`. The others are always started from the page
 * they describe, so they answer `null` and nothing navigates. */
export function homeFor(tour: TourId): '/' | '/learn' | null {
  return tour === 'learn' ? '/learn' : null;
}
