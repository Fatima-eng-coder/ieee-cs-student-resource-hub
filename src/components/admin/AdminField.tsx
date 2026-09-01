import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, X, Loader2, Paperclip, FileCheck2 } from 'lucide-react';
import { downscaleImage } from '@/utils/image';
import AvatarCropper from '@/components/ui/AvatarCropper';

const inputClass =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-ieee-orange focus:ring-2 focus:ring-ieee-orange/20 placeholder:text-slate-400';

export function AdminField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-ieee-orange">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function AdminTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-24 resize-y ${props.className ?? ''}`} />;
}

export function AdminSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

/**
 * Image field that stores a downscaled data URL (swap for a real upload URL later).
 *
 * `shape="circle"` opens the cropper instead of taking the file as-is. Anything the site
 * renders as a circle needs it: `object-cover` crops from the centre, which reliably cuts the
 * top off a portrait, and the person uploading has no way to see that until it is published.
 * Rectangular art — banners, gallery covers, posters — keeps the plain path.
 */
export function AdminImageField({
  value,
  onChange,
  shape = 'rect',
}: {
  value: string;
  onChange: (url: string) => void;
  shape?: 'rect' | 'circle';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState(false);

  if (shape === 'circle') {
    if (cropping || !value) {
      return (
        <AvatarCropper
          value={value}
          size={200}
          onChange={(dataUrl) => {
            onChange(dataUrl);
            setCropping(false);
          }}
          onCancel={value ? () => setCropping(false) : undefined}
        />
      );
    }

    return (
      <div className="flex items-center gap-4">
        <img src={value} alt="" className="h-20 w-20 rounded-full border border-black/10 object-cover" />
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setCropping(true)}
            className="text-sm font-semibold text-slate-600 transition hover:text-ieee-orange"
          >
            Reposition or replace
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-left text-xs font-medium text-slate-400 transition hover:text-rose-600"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="Preview" className="h-28 w-28 rounded-xl border border-black/10 object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ieee-ink text-white"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-ieee-orange/60 hover:text-ieee-orange"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-[11px] font-medium">Upload</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onChange(await downscaleImage(f));
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}

/**
 * Any-file upload (PDF, image, doc…) stored as a data URL so it can be
 * downloaded/previewed. Images are downscaled; other files stored as-is.
 * Swap for a real upload returning a hosted URL with the backend.
 */
export function AdminFileField({
  value,
  onChange,
  accept = '.pdf,image/*',
}: {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const has = !!value && value !== '#';

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`flex flex-1 items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition ${
          has ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-500 hover:border-ieee-orange/60'
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : has ? (
          <FileCheck2 className="h-4 w-4" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
        {has ? 'File attached — click to replace' : 'Upload file (PDF / image)'}
      </button>
      {has && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/10 text-slate-400 hover:text-rose-600"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onChange(f.type.startsWith('image/') ? await downscaleImage(f) : await readFile(f));
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}
