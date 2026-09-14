import { useRef, useState } from 'react';
import { Paperclip, X, Loader2, FileCheck2, Upload } from 'lucide-react';
import type { FormField, FormAnswer } from '@/types';
import { formsService } from '@/services/formsService';
import { FORMAT_SPECS } from '@/utils/formFormats';

interface Props {
  field: FormField;
  value: FormAnswer | undefined;
  onChange: (value: FormAnswer) => void;
  error?: boolean;
  /** Needed to file an upload under the right form. */
  formId: string;
}

/** The filename at the end of a stored attachment URL, for showing what is attached. */
const fileNameFromUrl = (url: string) => {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    // Uploads are stored as "<epoch>-<slug>.<ext>"; the epoch is ours, not the student's.
    return name.replace(/^\d{10,}-/, '') || 'Attached file';
  } catch {
    return 'Attached file';
  }
};

const inputBase =
  'w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-ieee-orange/20';

export default function FormFieldInput({ field, value, onChange, error, formId }: Props) {
  const border = error ? 'border-rose-400' : 'border-black/10 focus:border-ieee-orange';
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // The question's own sample text, falling back to the chosen format's example. An admin who
  // picks "Registration number" and writes no placeholder still gets "e.g. FA24-BCS-059" in the
  // box, which is the thing that actually stops people guessing at the shape.
  const spec = field.format && field.format !== 'none' ? FORMAT_SPECS[field.format] : null;
  const placeholder = field.placeholder || spec?.samplePlaceholder || undefined;

  /** Shared by both attachment types: upload on choose, store the URL, report failure inline. */
  const uploadFile = async (file: File, imagesOnly: boolean) => {
    setBusy(true);
    setUploadError(null);
    try {
      onChange(await formsService.uploadAttachment(file, formId, imagesOnly));
    } catch (cause) {
      // Left empty rather than half-set: a value here means "a file is attached", and an answer
      // that says so when the upload failed is exactly the lie this whole change is fixing.
      onChange('');
      setUploadError(cause instanceof Error ? cause.message : 'That file could not be uploaded.');
    } finally {
      setBusy(false);
    }
  };

  switch (field.type) {
    case 'long-text':
      return (
        <textarea
          rows={4}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputBase} ${border} min-h-28 resize-y`}
        />
      );

    case 'email':
    case 'number':
    case 'date':
    case 'short-text':
      return (
        <input
          type={field.type === 'short-text' ? 'text' : field.type}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          /* Drives the phone keyboard -- a registration-number or number field should not open
             a QWERTY pad. It is a hint, not a constraint; the format rule is the constraint. */
          inputMode={spec?.inputMode}
          className={`${inputBase} ${border}`}
        />
      );

    case 'dropdown':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputBase} ${border}`}
        >
          <option value="">{placeholder || 'Select…'}</option>
          {field.options?.map((o) => (
            <option key={o.id} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case 'radio':
      return (
        <div className="flex flex-col gap-2">
          {field.options?.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition ${
                value === o.label ? 'border-ieee-orange bg-ieee-orange/5 text-slate-900' : 'border-black/10 text-slate-600 hover:border-ieee-orange/40'
              }`}
            >
              <input
                type="radio"
                name={field.id}
                checked={value === o.label}
                onChange={() => onChange(o.label)}
                className="accent-ieee-orange"
              />
              {o.label}
            </label>
          ))}
        </div>
      );

    case 'checkbox': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (label: string) =>
        onChange(arr.includes(label) ? arr.filter((v) => v !== label) : [...arr, label]);
      return (
        <div className="flex flex-col gap-2">
          {field.options?.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition ${
                arr.includes(o.label) ? 'border-ieee-orange bg-ieee-orange/5 text-slate-900' : 'border-black/10 text-slate-600 hover:border-ieee-orange/40'
              }`}
            >
              <input
                type="checkbox"
                checked={arr.includes(o.label)}
                onChange={() => toggle(o.label)}
                className="accent-ieee-orange"
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }

    case 'file': {
      /*
       * This used to be `onChange(f.name)` — the File was discarded on the very next line and
       * the button then displayed the filename, so it looked attached. Every document ever
       * "collected" through a form on this site was a filename and nothing behind it.
       */
      const url = (value as string) ?? '';
      return (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={`flex w-full items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-left text-sm transition disabled:opacity-60 ${
              error || uploadError ? 'border-rose-400' : 'border-slate-300 hover:border-ieee-orange/60'
            } ${url ? 'text-slate-800' : 'text-slate-500'}`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ieee-orange" />
            ) : url ? (
              <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {busy ? 'Uploading…' : url ? fileNameFromUrl(url) : placeholder || 'Choose a file…'}
            </span>
            {url && !busy && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Remove file"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                  setUploadError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange('');
                  }
                }}
                className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
          <p className="mt-1.5 text-xs text-slate-400">PDF, PNG, JPG or WebP · up to 5 MB</p>
          {uploadError && (
            <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
              {uploadError}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Cleared immediately so re-picking the same file after a failure still fires.
              e.target.value = '';
              if (f) void uploadFile(f, false);
            }}
          />
        </div>
      );
    }

    case 'image': {
      /*
       * Answers now hold a hosted URL. Responses collected before this change hold a base64
       * data: URL instead; `<img src>` renders both, so an admin re-opening an old response
       * still sees the picture rather than a broken frame.
       */
      const url = (value as string) ?? '';
      return (
        <div>
          {url ? (
            <div className="relative inline-block">
              <img src={url} alt="Upload preview" className="h-40 rounded-xl border border-black/10 object-cover" />
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ieee-ink/70 text-white backdrop-blur"
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm text-slate-500 transition disabled:opacity-60 ${
                error || uploadError ? 'border-rose-400' : 'border-slate-300 hover:border-ieee-orange/60'
              }`}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-ieee-orange" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> {placeholder || 'Upload an image'}
                </>
              )}
            </button>
          )}
          <p className="mt-1.5 text-xs text-slate-400">PNG, JPG or WebP · up to 5 MB</p>
          {uploadError && (
            <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
              {uploadError}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            /*
             * The bucket's allowlist, not `image/*`. `image/*` offered HEIC, SVG and GIF, which
             * the old canvas path silently re-encoded to JPEG and which the bucket rejects with
             * a 415 -- so the picker has to agree with what will actually be accepted.
             */
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadFile(f, true);
            }}
          />
        </div>
      );
    }

    default:
      return null;
  }
}
