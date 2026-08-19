import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface CropModalProps {
  imageUrl: string;
  onConfirm(blob: Blob): void;
  onCancel(): void;
}

interface Box {
  x: number;
  y: number;
  size: number;
}

const MIN_BOX_SIZE = 24;

/** Full-viewport crop step: drag/resize a square selection over the picked
 * photo, then export just that region as a PNG blob. Bigger than the
 * app's standard Modal (needs to show the photo at a usable size), so it's
 * its own overlay rather than reusing that component. */
export function CropModal({ imageUrl, onConfirm, onCancel }: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    start: Box;
  } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function handleImageLoad() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const size = Math.min(rect.width, rect.height) * 0.8;
    setBox({ x: (rect.width - size) / 2, y: (rect.height - size) / 2, size });
  }

  function startDrag(mode: 'move' | 'resize') {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!box) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, start: box };
    };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.mode === 'move') {
      const maxX = rect.width - drag.start.size;
      const maxY = rect.height - drag.start.size;
      setBox({
        size: drag.start.size,
        x: Math.min(Math.max(drag.start.x + dx, 0), Math.max(maxX, 0)),
        y: Math.min(Math.max(drag.start.y + dy, 0), Math.max(maxY, 0)),
      });
    } else {
      const maxSize = Math.min(rect.width - drag.start.x, rect.height - drag.start.y);
      const size = Math.min(
        Math.max(drag.start.size + Math.max(dx, dy), MIN_BOX_SIZE),
        maxSize,
      );
      setBox({ x: drag.start.x, y: drag.start.y, size });
    }
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !box) return;
    const rect = img.getBoundingClientRect();
    const scale = img.naturalWidth / rect.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.size * scale);
    canvas.height = canvas.width;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      img,
      box.x * scale,
      box.y * scale,
      box.size * scale,
      box.size * scale,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, 'image/png');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop the puzzle photo"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 p-4"
      onClick={onCancel}
    >
      <div className="max-w-md text-center text-sm text-neutral-200">
        <p>Works best with a screenshot of a digital puzzle, not a photo of paper.</p>
        <p className="mt-1">
          Line up the guide lines with the puzzle&apos;s own grid lines — a loose crop can
          misread digits.
        </p>
        <p className="mt-1 text-neutral-400">
          Keep the box clean: nothing inside it but the 81 cells (no fingers, glare, or
          marks).
        </p>
      </div>
      <div
        ref={containerRef}
        className="relative inline-block max-h-[70vh] max-w-full touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Puzzle to crop"
          onLoad={handleImageLoad}
          className="block max-h-[70vh] max-w-full select-none"
          draggable={false}
        />
        {box && (
          <>
            {/* Dim everything outside the crop box. Four explicit panels
                instead of a huge box-shadow spread — that trick paints past
                this container (no overflow-hidden here, and adding it would
                clip the resize handle when the box reaches the image edge),
                washing out the instructions/buttons outside the photo too. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 bg-black/50"
              style={{ height: box.y }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50"
              style={{ top: box.y + box.size }}
            />
            <div
              className="pointer-events-none absolute bg-black/50"
              style={{ left: 0, top: box.y, width: box.x, height: box.size }}
            />
            <div
              className="pointer-events-none absolute bg-black/50"
              style={{ left: box.x + box.size, top: box.y, right: 0, height: box.size }}
            />
            <div
              onPointerDown={startDrag('move')}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              className="absolute cursor-move touch-none border-2 border-emerald-400"
              style={{ left: box.x, top: box.y, width: box.size, height: box.size }}
            >
              {/* Alignment guide — match these lines to the grid's own lines
                  underneath so each cell lands in its own slice. */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-9 grid-rows-9">
                {Array.from({ length: 81 }, (_, i) => (
                  <div key={i} className="border border-emerald-400/40" />
                ))}
              </div>
              <div
                onPointerDown={startDrag('resize')}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-emerald-400 bg-white"
              />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          onClick={handleConfirm}
          disabled={!box}
        >
          Use this crop
        </button>
      </div>
    </div>
  );
}
