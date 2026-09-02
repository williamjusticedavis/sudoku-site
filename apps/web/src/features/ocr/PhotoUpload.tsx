import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CropModal } from './CropModal.js';

interface PhotoUploadProps {
  onGrid(grid: string): void;
  onError(message: string): void;
  className?: string;
  disabled?: boolean;
  /** Spotlight anchor for the site tour (see features/tour/steps.ts). The
   * button is rendered here, so the attribute has to be handed down. */
  'data-tour'?: string;
}

// Falls back to the repo's documented local-dev default (see .env.example)
// for standalone `pnpm dev` outside docker compose.
//
// A bare domain (no scheme) isn't an absolute URL to fetch() — it's a
// relative path, silently resolved against the current page's own origin
// instead of erroring. Hit this for real: a platform's "public domain"
// reference variable (e.g. Railway's RAILWAY_PUBLIC_DOMAIN) is just the
// domain, no https:// — normalize defensively rather than trust the env
// var's shape.
function normalizeApiUrl(raw: string): string {
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}
const API_URL = normalizeApiUrl(
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000',
);

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
export function PhotoUpload({
  onGrid,
  onError,
  className,
  disabled,
  'data-tour': dataTour,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Derive the object URL from the picked File, in the same effect that
  // revokes it — new pick, cleanup, or unmount mid-crop all run this
  // cleanup, so the object URL never outlives the component's need for it.
  useEffect(() => {
    if (!pickedFile) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(pickedFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pickedFile]);

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    setPickedFile(file);
    setStage('cropping');
  }

  function handleCancelCrop() {
    setPickedFile(null);
    setStage('idle');
  }

  async function handleCropConfirm(blob: Blob) {
    setPickedFile(null);
    setStage('uploading');
    try {
      const form = new FormData();
      form.append('image', blob, 'grid.png');
      const res = await fetch(`${API_URL}/ocr/grid`, { method: 'POST', body: form });
      if (!res.ok) {
        const errorBody: { error?: string } | null = await res.json().catch(() => null);
        onError(describeOcrError(errorBody?.error));
        return;
      }
      const body: { ok?: boolean; grid?: string; error?: string } | null = await res
        .json()
        .catch(() => null);
      if (!body?.ok || !body.grid) {
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
        data-tour={dataTour}
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
