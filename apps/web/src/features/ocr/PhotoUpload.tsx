import { useRef, useState, type ChangeEvent } from 'react';
import { CropModal } from './CropModal.js';

interface PhotoUploadProps {
  onGrid(grid: string): void;
  onError(message: string): void;
  className?: string;
  disabled?: boolean;
}

// Falls back to the repo's documented local-dev default (see .env.example)
// for standalone `pnpm dev` outside docker compose, which is the only place
// that injects VITE_API_URL as a real env var today.
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

type Stage = 'idle' | 'cropping' | 'uploading';

function describeOcrError(code: string | undefined): string {
  switch (code) {
    case 'no-file':
      return 'No photo was received — please try again.';
    case 'file-too-large':
      return 'That photo is too large (max 8MB).';
    case 'unreadable-image':
      return "Couldn't read that image — try a different photo.";
    case 'no-grid-detected':
      return "Couldn't find a grid in that photo — make sure the crop covers just the 9x9 grid.";
    case 'too-few-confident-digits':
      return "Couldn't read any digits clearly — try a clearer, better-lit photo.";
    default:
      return 'Something went wrong reading that photo — please try again.';
  }
}

/** Pick a photo -> crop to the grid -> upload for OCR -> hand back a grid string. */
export function PhotoUpload({ onGrid, onError, className, disabled }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setStage('cropping');
  }

  function cleanupImage() {
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function handleCancelCrop() {
    cleanupImage();
    setStage('idle');
  }

  async function handleCropConfirm(blob: Blob) {
    cleanupImage();
    setStage('uploading');
    try {
      const form = new FormData();
      form.append('image', blob, 'grid.png');
      const res = await fetch(`${API_URL}/ocr/grid`, { method: 'POST', body: form });
      const body: { ok?: boolean; grid?: string; error?: string } | null = await res
        .json()
        .catch(() => null);
      if (!res.ok || !body?.ok || !body.grid) {
        onError(describeOcrError(body?.error));
      } else {
        onGrid(body.grid);
      }
    } catch {
      onError(
        "Couldn't reach the server to read the photo — check your connection and try again.",
      );
    } finally {
      setStage('idle');
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />
      <button
        type="button"
        className={className}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || stage === 'uploading'}
      >
        {stage === 'uploading' ? 'Reading photo…' : 'Upload photo'}
      </button>
      {stage === 'cropping' && imageUrl && (
        <CropModal
          imageUrl={imageUrl}
          onConfirm={handleCropConfirm}
          onCancel={handleCancelCrop}
        />
      )}
    </>
  );
}
