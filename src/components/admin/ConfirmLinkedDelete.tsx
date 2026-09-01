/**
 * A delete confirmation for a row other rows point at. It names what is linked, spells out
 * what the delete destroys either way, and offers a single opt-in checkbox for taking the
 * linked rows along.
 *
 * The checkbox is owned here rather than by the caller so that "off unless the admin ticks
 * it" has exactly one implementation — three pages share this dialog and each one getting
 * the default right is three chances to get it wrong. It also resets every time the dialog
 * opens, so a cascade agreed to for one row is never inherited by the next.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';

export interface LinkedItemRef {
  id: string;
  title: string;
  /** Second line under the title: what this particular link costs. */
  detail?: string;
}

export interface LinkedDeleteTarget {
  /** One sentence naming the relationship, in the admin's words. */
  heading: string;
  items: LinkedItemRef[];
  /** Label on the opt-in checkbox. */
  cascadeLabel: string;
  /** Always-visible consequence of ticking the box. */
  cascadeHint?: string;
  /** Shown only once the box is ticked, for damage beyond the listed items. */
  cascadeWarning?: string;
}

/** More than this and the list becomes a wall of text nobody reads. */
const MAX_LISTED = 6;

export default function ConfirmLinkedDelete({
  open,
  title,
  description,
  losses,
  linked,
  loading = false,
  lookupError,
  busy = false,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** What this delete destroys whatever the admin decides about the link. */
  losses?: string[];
  /** Null while nothing is linked, or until the lookup that finds the links resolves. */
  linked?: LinkedDeleteTarget | null;
  /** The link lookup is still running; confirming now would be confirming an unknown. */
  loading?: boolean;
  /** The link lookup failed. The delete is still offered, without the cascade option. */
  lookupError?: string | null;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: (cascade: boolean) => void;
  onCancel: () => void;
}) {
  const [cascade, setCascade] = useState(false);

  useEffect(() => {
    if (open) setCascade(false);
  }, [open]);

  const items = linked?.items ?? [];
  const hidden = Math.max(items.length - MAX_LISTED, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-black/5 bg-white p-6 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
            {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}

            {losses && losses.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-slate-500">
                {losses.map((loss) => (
                  <li key={loss} className="flex items-start gap-2">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    {loss}
                  </li>
                ))}
              </ul>
            )}

            {loading && (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking what this is linked to...
              </p>
            )}

            {!loading && lookupError && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {lookupError}
              </p>
            )}

            {!loading && linked && items.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
                <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {linked.heading}
                </p>

                <ul className="mt-2.5 flex flex-col gap-2">
                  {items.slice(0, MAX_LISTED).map((item) => (
                    <li key={item.id} className="rounded-xl bg-white px-3 py-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                      {item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
                    </li>
                  ))}
                </ul>
                {hidden > 0 && (
                  <p className="mt-2 text-xs font-medium text-amber-800">
                    and {hidden} more.
                  </p>
                )}

                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/5 bg-white px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={cascade}
                    disabled={busy}
                    onChange={(event) => setCascade(event.target.checked)}
                    className="mt-0.5 accent-rose-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{linked.cascadeLabel}</span>
                    {linked.cascadeHint && (
                      <span className="block text-xs text-slate-500">{linked.cascadeHint}</span>
                    )}
                  </span>
                </label>

                {cascade && linked.cascadeWarning && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-rose-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {linked.cascadeWarning}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-black/5 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(cascade)}
                // Disabled while the lookup runs: confirming before it lands is confirming a
                // question the admin has not been shown yet.
                disabled={busy || loading}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Deleting...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
