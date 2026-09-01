/**
 * Pick a photo, position it, and see the exact circle that will be published.
 *
 * Photos get displayed as small circles all over this site — the hierarchy tree, developer
 * cards, the header. A rectangular file dropped into `object-cover` crops from the centre,
 * which routinely cuts off the top of someone's head. This lets the person doing the upload
 * decide what the circle contains, and shows them the real result at the real size rather
 * than a large preview that flatters a bad crop.
 *
 * The output is a square JPEG at OUTPUT_SIZE; the circle is a CSS mask at display time, not
 * baked into the file. Storing a square keeps the image usable if a surface ever shows it as
 * a rounded rectangle, and avoids shipping transparency the JPEG format cannot carry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, Upload, ZoomIn } from 'lucide-react';

/** Published size. Twice the largest circle the site draws, so it stays sharp on retina. */
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** Anything larger is a phone photo that will be downscaled anyway. */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

interface AvatarCropperProps {
  /** Current image, shown when nothing new has been picked. */
  value?: string;
  onChange: (dataUrl: string) => void;
  onCancel?: () => void;
  /** Diameter of the editing circle in px. The live previews stay true-to-size regardless. */
  size?: number;
  label?: string;
}

interface Offset {
  x: number;
  y: number;
}

export default function AvatarCropper({
  value,
  onChange,
  onCancel,
  size = 240,
  label = 'Profile photo',
}: AvatarCropperProps) {
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ pointerId: number; from: Offset; origin: Offset } | null>(null);

  /* ---------------------------------------------------------------- */
  /* Loading                                                          */
  /* ---------------------------------------------------------------- */

  const loadFile = (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That image is too large. Please pick one under 12 MB.');
      return;
    }

    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setSource(image);
        setZoom(MIN_ZOOM);
        setOffset({ x: 0, y: 0 });
        setBusy(false);
      };
      image.onerror = () => {
        setError('That image could not be read.');
        setBusy(false);
      };
      image.src = reader.result as string;
    };
    reader.onerror = () => {
      setError('That file could not be read.');
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };

  /* ---------------------------------------------------------------- */
  /* Geometry                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * The scale at which the image exactly covers the circle. Everything else is expressed as a
   * multiple of it, so zoom 1 always means "no gaps" no matter the photo's aspect ratio.
   */
  const coverScale = useCallback(() => {
    if (!source) return 1;
    return Math.max(size / source.width, size / source.height);
  }, [source, size]);

  /** Keeps the image covering the circle, so a drag can never expose a blank edge. */
  const clampOffset = useCallback(
    (next: Offset, atZoom: number): Offset => {
      if (!source) return { x: 0, y: 0 };
      const scale = coverScale() * atZoom;
      const slackX = Math.max(0, (source.width * scale - size) / 2);
      const slackY = Math.max(0, (source.height * scale - size) / 2);
      return {
        x: Math.min(slackX, Math.max(-slackX, next.x)),
        y: Math.min(slackY, Math.max(-slackY, next.y)),
      };
    },
    [source, size, coverScale]
  );

  useEffect(() => {
    setOffset((current) => clampOffset(current, zoom));
  }, [zoom, clampOffset]);

  /* ---------------------------------------------------------------- */
  /* Rendering the crop                                               */
  /* ---------------------------------------------------------------- */

  /** Draws the visible circle to a square canvas at publish resolution. */
  const render = useCallback((): string => {
    if (!source) return '';
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // A photo will not have transparency, but a PNG with an alpha channel would otherwise
    // turn black once encoded as JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    // The editing stage is `size` px across and the output is OUTPUT_SIZE, so every on-screen
    // measurement scales by the same ratio.
    const ratio = OUTPUT_SIZE / size;
    const scale = coverScale() * zoom * ratio;
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    const left = (OUTPUT_SIZE - drawWidth) / 2 + offset.x * ratio;
    const top = (OUTPUT_SIZE - drawHeight) / 2 + offset.y * ratio;

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, left, top, drawWidth, drawHeight);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, [source, size, zoom, offset, coverScale]);

  // The small previews show the real output, not a scaled copy of the stage — otherwise they
  // would flatter a crop that is actually clipping someone's chin.
  useEffect(() => {
    if (!source) {
      setPreview('');
      return;
    }
    const id = window.setTimeout(() => setPreview(render()), 90);
    return () => window.clearTimeout(id);
  }, [source, render]);

  /* ---------------------------------------------------------------- */
  /* Dragging                                                         */
  /* ---------------------------------------------------------------- */

  const onPointerDown = (event: React.PointerEvent) => {
    if (!source) return;
    dragging.current = {
      pointerId: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      origin: offset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragging.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      clampOffset(
        {
          x: drag.origin.x + (event.clientX - drag.from.x),
          y: drag.origin.y + (event.clientY - drag.from.y),
        },
        zoom
      )
    );
  };

  const endDrag = (event: React.PointerEvent) => {
    if (dragging.current?.pointerId === event.pointerId) dragging.current = null;
  };

  /** Arrow keys nudge the photo, so the crop is reachable without a pointer. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!source) return;
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, Offset> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setOffset((current) => clampOffset({ x: current.x + move.x, y: current.y + move.y }, zoom));
  };

  const reset = () => {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  const stageStyle = source
    ? {
        backgroundImage: `url(${source.src})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `calc(50% + ${offset.x}px) calc(50% + ${offset.y}px)`,
        backgroundSize: `${source.width * coverScale() * zoom}px ${source.height * coverScale() * zoom}px`,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) loadFile(file);
          event.target.value = '';
        }}
      />

      {!source ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-slate-400 transition hover:border-ieee-orange/60 hover:text-ieee-orange"
          style={{ minHeight: size }}
        >
          {value ? (
            <img src={value} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
          <span className="text-sm font-semibold">{value ? 'Replace photo' : `Choose a ${label.toLowerCase()}`}</span>
          <span className="text-xs">You'll be able to position it before saving.</span>
        </button>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Editing stage. The dimmed square outside the circle shows what is being cut. */}
          <div className="flex flex-col items-center gap-3">
            <div
              ref={stageRef}
              role="application"
              tabIndex={0}
              aria-label="Drag to position the photo. Arrow keys nudge it."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
              className="relative touch-none overflow-hidden rounded-2xl bg-slate-100 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ieee-orange"
              style={{ width: size, height: size, cursor: 'grab', ...stageStyle }}
            >
              {/* Everything outside the circle is dimmed by a ring thick enough to reach the
                  corners, which needs no mask support and degrades safely. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ boxShadow: `0 0 0 ${size}px rgba(15, 23, 42, 0.55)` }}
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" />
            </div>

            <div className="flex w-full items-center gap-3" style={{ maxWidth: size }}>
              <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="Zoom"
                className="h-1.5 w-full accent-ieee-orange"
              />
              <button
                type="button"
                onClick={reset}
                aria-label="Reset position and zoom"
                title="Reset"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* True-to-size previews at the diameters the site actually renders. */}
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              How it will appear
            </p>
            <div className="flex items-end gap-4">
              {[
                { px: 64, caption: 'Roster' },
                { px: 40, caption: 'Card' },
                { px: 28, caption: 'Header' },
              ].map(({ px, caption }) => (
                <div key={px} className="flex flex-col items-center gap-1.5">
                  <span
                    className="block overflow-hidden rounded-full bg-cream ring-1 ring-black/10"
                    style={{ width: px, height: px }}
                  >
                    {preview && <img src={preview} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="text-[10px] text-slate-400">{caption}</span>
                </div>
              ))}
            </div>
            <p className="max-w-[14rem] text-xs leading-snug text-slate-500">
              Drag the photo to reposition it, or use the arrow keys. Only what stays inside the
              circle is saved.
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(render())}
          disabled={!source}
          className="rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-ieee-orange-dark disabled:opacity-50"
        >
          Save photo
        </button>
        {source && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
          >
            Pick another
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
