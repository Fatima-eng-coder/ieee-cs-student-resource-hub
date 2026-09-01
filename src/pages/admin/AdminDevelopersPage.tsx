import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Pencil } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput } from '@/components/admin/AdminField';
import Avatar from '@/components/ui/Avatar';
import { developerLinksService } from '@/services/developerLinksService';
import { developerProfiles } from '@/data/developers';
import { formatPakistaniMobile, isPakistaniMobile, normalisePakistaniMobile } from '@/utils/validation';
import type { Developer, DeveloperLinks } from '@/types';

/**
 * Contact links only.
 *
 * There is no "add developer" and no "remove" here by design — the roster lives in
 * src/data/developers.ts, and public.developer_links has no INSERT or DELETE policy for any
 * role, so those buttons could not work even if they existed. What goes stale is the links,
 * and that is what this page edits.
 */
export default function AdminDevelopersPage() {
  const [developers, setDevelopers] = useState<Developer[]>(() =>
    developerProfiles.map((profile) => ({ ...profile, links: {} }))
  );
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Developer | null>(null);
  const [draft, setDraft] = useState<DeveloperLinks>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedSlug, setSavedSlug] = useState('');

  const load = () => {
    developerLinksService
      .list()
      .then(setDevelopers)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openEditor = (developer: Developer) => {
    setEditing(developer);
    setDraft({ ...developer.links });
    setError('');
  };

  const phoneInvalid = Boolean(draft.phone?.trim()) && !isPakistaniMobile(draft.phone ?? '');

  const save = async () => {
    if (!editing || phoneInvalid) return;
    setSaving(true);
    setError('');
    try {
      // Store one canonical form regardless of how it was typed, so the tel: link always works.
      const phone = draft.phone?.trim() ? (normalisePakistaniMobile(draft.phone) ?? undefined) : undefined;
      await developerLinksService.updateLinks(editing.id, { ...draft, phone });

      setSavedSlug(editing.id);
      window.setTimeout(() => setSavedSlug(''), 2200);
      setEditing(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save those links.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminTopbar
        title="Developers"
        subtitle="Contact links for the people credited on the site"
      />

      <div className="p-4 sm:p-6">
        <p className="mb-5 max-w-2xl rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600 ring-1 ring-black/5">
          Names, roles, photos and write-ups are part of the site itself and are not editable here.
          Ask a maintainer to change those. Everything below is a contact link, which anyone on the
          team can keep current.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-ieee-orange" /> Loading links…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {developers.map((developer, i) => {
              const filled = Object.values(developer.links).filter(Boolean).length;
              return (
                <motion.div
                  key={developer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.03 }}
                  className="flex gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
                >
                  <Avatar name={developer.name} src={developer.photo} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{developer.name}</p>
                    <p className="truncate text-xs text-slate-500">{developer.role}</p>
                    <p className="mt-1 font-mono text-[10px] tracking-wide text-slate-400 uppercase">
                      {filled} of 5 links set
                    </p>
                    <button
                      onClick={() => openEditor(developer)}
                      className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-ieee-orange"
                    >
                      <Pencil className="h-3 w-3" /> Edit links
                    </button>
                  </div>
                  {savedSlug === developer.id && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {error && !editing && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      </div>

      <AdminEditDrawer
        open={!!editing}
        title={editing ? `${editing.name}'s links` : ''}
        subtitle={editing?.role}
        onClose={() => setEditing(null)}
        footer={
          <button
            onClick={() => void save()}
            disabled={saving || phoneInvalid}
            className="w-full rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-ieee-orange-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save links'}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <AdminField label="Portfolio" hint="Full URL, including https://">
            <AdminInput
              value={draft.portfolio ?? ''}
              onChange={(e) => setDraft({ ...draft, portfolio: e.target.value })}
              placeholder="https://"
            />
          </AdminField>
          <AdminField label="LinkedIn">
            <AdminInput
              value={draft.linkedin ?? ''}
              onChange={(e) => setDraft({ ...draft, linkedin: e.target.value })}
              placeholder="https://linkedin.com/in/…"
            />
          </AdminField>
          <AdminField label="GitHub">
            <AdminInput
              value={draft.github ?? ''}
              onChange={(e) => setDraft({ ...draft, github: e.target.value })}
              placeholder="https://github.com/…"
            />
          </AdminField>
          <AdminField label="Email">
            <AdminInput
              type="email"
              value={draft.email ?? ''}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </AdminField>
          <AdminField
            label="Phone"
            hint="Any usual spelling — 0317 7880059, +92 317 7880059 — it is stored one way."
          >
            <AdminInput
              type="tel"
              value={draft.phone ?? ''}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="0317 7880059"
            />
          </AdminField>
          {phoneInvalid && (
            <p className="-mt-2 text-xs font-medium text-rose-600">
              That does not look like a Pakistani mobile number.
            </p>
          )}
          {draft.phone?.trim() && !phoneInvalid && (
            <p className="-mt-2 text-xs text-slate-500">
              Saved as {formatPakistaniMobile(normalisePakistaniMobile(draft.phone) ?? '')}
            </p>
          )}

          <p className="text-xs leading-relaxed text-slate-400">
            Leave a field empty to hide that link on the developers page.
          </p>

          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        </div>
      </AdminEditDrawer>
    </div>
  );
}
