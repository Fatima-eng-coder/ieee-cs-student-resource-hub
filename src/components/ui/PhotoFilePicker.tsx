/**
 * Picks image files and hands back the File objects themselves.
 *
 * MultiImageUpload next door downscales to a data URL, which is right for the places that
 * keep a copy in the browser — but a submission uploads to storage, and a data URL would mean
 * decoding a canvas re-encode back into bytes on the way out. Previews here are object URLs,
 * created against the real file and revoked when it goes.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, X } from 'lucide-react';

interface PhotoFilePickerProps {
  value: File[];
  onChange: (files: File[]) => void;
  max?: number;
  accept?: string;
}

export default function PhotoFilePicker({
  value,
  onChange,
  max = 3,
  accept = 'image/png,image/jpeg,image/webp',
}: PhotoFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  // Rebuilt whenever the selection changes, and every url revoked on the way out — an object
  // url pins the whole file in memory until it is released.
  useEffect(() => {
    const urls = value.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [value]);

  const canAdd = value.length < max;

  const add = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = max - value.length;
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, room);
    if (picked.length > 0) onChange([...value, ...picked]);
  };

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {value.map((file, index) => (
              <motion.div
                key={`${file.name}-${file.lastModified}-${index}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative h-20 w-20 overflow-hidden rounded-xl border border-black/10 bg-slate-100"
              >
                {previews[index] && (
                  <img src={previews[index]} alt={file.name} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${file.name}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ieee-ink/70 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {canAdd && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            add(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-sm transition ${
            dragOver
              ? 'border-ieee-orange bg-ieee-orange/5 text-ieee-orange'
              : 'border-black/15 text-slate-500 hover:border-ieee-orange/50 hover:text-ieee-orange'
          }`}
        >
          <ImagePlus className="h-5 w-5" />
          <span className="font-medium">
            {value.length === 0 ? 'Choose photos' : `Add another (${value.length} of ${max})`}
          </span>
          <span className="text-xs text-slate-400">PNG, JPG or WebP · up to 5 MB each</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          // Cleared so re-picking the same file still fires a change event.
          e.target.value = '';
        }}
      />
    </div>
  );
}
