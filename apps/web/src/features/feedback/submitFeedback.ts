/**
 * The one write the public can make. Same shape as the Learn server functions:
 * `@sudoku/db` is imported inside the handler so the driver never reaches the
 * client bundle.
 *
 * NB: do NOT rename this to `*.server.ts` — that filename triggers the TanStack
 * Start plugin's import-protection, which denies the (isomorphic) route files
 * from importing it and hangs client-side navigation. See the same warning in
 * `features/learn/tactics.ts`.
 */
import { createServerFn } from '@tanstack/react-start';

export const NAME_MAX = 80; // matches feedback.name's varchar(80)
export const MESSAGE_MAX = 4000;

export interface FeedbackInput {
  name: string;
  message: string;
  /** Honeypot. Real people never see this field, so anything in it is a bot. */
  website?: string;
}

/**
 * Shared by the form and the server function, so the two can never disagree
 * about what a valid submission is. Returns the first problem as a message
 * meant to be shown, or `null` when there is none.
 *
 * The server runs this too rather than trusting the form to have done it: a
 * server function is an RPC endpoint, reachable without ever loading the page.
 */
export function validateFeedback(input: FeedbackInput): string | null {
  const name = input.name.trim();
  const message = input.message.trim();
  if (name === '') return 'Please add a name.';
  if (name.length > NAME_MAX) return `Names can be at most ${NAME_MAX} characters.`;
  if (message === '') return 'Please write a message.';
  if (message.length > MESSAGE_MAX) {
    return `Messages can be at most ${MESSAGE_MAX} characters.`;
  }
  return null;
}

interface Validated {
  name: string;
  message: string;
  /** Honeypot tripped. Carried through instead of throwing so the caller can be
   * told it worked while nothing is written — an error naming the field just
   * teaches a bot to leave that one alone next time. */
  spam: boolean;
}

export const submitFeedback = createServerFn({ method: 'POST' })
  .validator((input: FeedbackInput): Validated => {
    const spam = (input.website ?? '').trim() !== '';
    if (!spam) {
      const problem = validateFeedback(input);
      if (problem) throw new Error(problem);
    }
    return { name: input.name.trim(), message: input.message.trim(), spam };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (data.spam) return { ok: true };
    const { db, feedback } = await import('@sudoku/db');
    await db.insert(feedback).values({ name: data.name, message: data.message });
    return { ok: true };
  });
