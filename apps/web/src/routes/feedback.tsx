import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  MESSAGE_MAX,
  NAME_MAX,
  submitFeedback,
  validateFeedback,
} from '../features/feedback/submitFeedback.js';

export const Route = createFileRoute('/feedback')({ component: FeedbackPage });

// Copied from the solver page rather than extracted: this codebase has no
// shared button component and inventing one for a single form is a bigger
// change than the form itself.
const btn =
  'rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-500`;

const field = [
  'w-full rounded-md border px-3 py-2 text-base',
  'border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400',
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none',
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-600',
].join(' ');

const label = 'text-sm font-medium text-neutral-900 dark:text-neutral-100';

const inlineLink =
  'font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:decoration-blue-400';

type Status = 'idle' | 'sending' | 'sent';

function FeedbackPage() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  // The honeypot. Never shown, never typed into by a person.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  // Submitting is held back until React has actually attached its handler.
  // Without this, a submit landing in the gap between first paint and hydration
  // is handled by the browser instead: no `onSubmit` has run, so nothing calls
  // `preventDefault`, and the form does a plain GET to its own URL — which puts
  // whatever was typed into the address bar and the user's history. A feedback
  // message is exactly the sort of thing that should not end up there.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Also guards against a double submit: `sending` disables the button, but a
    // form can still be submitted with Enter while a request is in flight.
    if (status === 'sending') return;

    const problem = validateFeedback({ name, message });
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setStatus('sending');
    try {
      await submitFeedback({ data: { name, message, website } });
      setStatus('sent');
    } catch {
      // The text typed is deliberately left in place — the form is still there
      // underneath this, so a failed send costs a click rather than the message.
      setStatus('idle');
      setError('Something went wrong sending that. Please try again.');
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        Feedback
      </h1>
      <p className="mb-8 text-base text-neutral-600 dark:text-neutral-400">
        Found a bug, hit a puzzle it got wrong, or want something that isn&rsquo;t here?
        Say so.
      </p>

      {status === 'sent' ? (
        <div className="flex flex-col gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-base text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          <p className="font-medium">Sent — thank you.</p>
          <p>
            It&rsquo;s read, though there&rsquo;s no way to reply: the form takes a name
            and a message and deliberately doesn&rsquo;t ask for an email.
          </p>
          <p>
            <Link to="/" className={inlineLink}>
              Back to the solver
            </Link>
          </p>
        </div>
      ) : (
        <form
          onSubmit={submit}
          // Belt and braces alongside the `hydrated` guard: if a submit somehow
          // gets through un-handled, POST leaves the fields in the request body
          // rather than the query string.
          method="post"
          noValidate
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-name" className={label}>
              Name
            </label>
            <input
              id="feedback-name"
              name="name"
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Whatever you'd like to be called"
              aria-describedby={error ? 'feedback-error' : undefined}
              className={field}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-message" className={label}>
              Message
            </label>
            <textarea
              id="feedback-message"
              name="message"
              rows={8}
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened, or what you'd like to see"
              aria-describedby={error ? 'feedback-error' : undefined}
              className={`${field} resize-y`}
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {message.length} / {MESSAGE_MAX}
            </p>
          </div>

          {/* Honeypot: hidden from people, left in the DOM for bots to fill.
              `hidden` rather than off-screen positioning, plus tabIndex -1 and
              autoComplete off, so nothing lands here by keyboard or autofill. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            hidden
          />

          {error && (
            <p
              id="feedback-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!hydrated || status === 'sending'}
              className={btnPrimary}
            >
              {status === 'sending' ? 'Sending…' : 'Send feedback'}
            </button>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No email, no account needed.
            </p>
          </div>
        </form>
      )}
    </main>
  );
}
