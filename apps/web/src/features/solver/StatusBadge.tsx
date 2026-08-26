const styles: Record<string, string> = {
  solved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  stuck: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  editing: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status] ?? styles.editing}`}
    >
      {status}
    </span>
  );
}
