import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Rendered in the footer (buttons). */
  actions: ReactNode;
  onClose(): void;
}

export function Modal({ open, title, children, actions, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Drive the native dialog imperatively from `open` — showModal() is what
  // actually gives us focus trapping/backdrop/top-layer; the `open`
  // attribute alone does not.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and dialog.close() both fire the native 'close' event, so this
  // one listener covers Escape, backdrop click, and any caller-supplied
  // action button that closes the dialog by flipping `open` to false.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onNativeClose = () => onClose();
    dialog.addEventListener('close', onNativeClose);
    return () => dialog.removeEventListener('close', onNativeClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close();
      }}
      className="m-auto w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl backdrop:bg-black/50 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          {children}
        </div>
        <div className="mt-5 flex justify-end gap-2">{actions}</div>
      </div>
    </dialog>
  );
}
