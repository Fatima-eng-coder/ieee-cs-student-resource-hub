import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  FileSearch,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { adminAuthService } from '@/services/adminAuthService';
import {
  storageCleanupService,
  type CourseDocumentCleanupScan,
} from '@/services/storageCleanupService';

const formatBytes = (bytes: number | null) => {
  if (bytes === null) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Site-wide content this screen used to hold its own copy of. Each one is edited on the
 * page that actually stores it, so the pointer replaces a duplicate that saved nowhere.
 */
const managedElsewhere = [
  {
    label: 'Site-wide ticker',
    description:
      'The scrolling bar above the header on the public site. It plays up to six pinned announcements, or the six newest when none are pinned. Log in and sign up sit outside that layout and do not show it.',
    to: '/portal/announcements',
  },
  {
    label: 'Footer links',
    description: 'Columns and links in the site footer.',
    to: '/portal/footer',
  },
  {
    label: 'Navbar links',
    description: 'Top-level navigation and its dropdowns.',
    to: '/portal/navbar',
  },
  {
    label: 'Quick links',
    description: 'The shortcuts listed on the Quick Links page.',
    to: '/portal/quick-links',
  },
];

export default function AdminSettingsPage() {
  const [scan, setScan] = useState<CourseDocumentCleanupScan | null>(null);
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupSuccess, setCleanupSuccess] = useState('');
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const admin = adminAuthService.getCurrentAdmin();
  const canManage = adminAuthService.canManageContent();

  const handleScanOrphans = async () => {
    if (!canManage) {
      setCleanupError('Only content managers can run storage cleanup.');
      return;
    }

    setScanning(true);
    setCleanupError('');
    setCleanupSuccess('');

    try {
      setScan(await storageCleanupService.scanCourseDocumentOrphans());
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : 'Storage cleanup scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleDeleteOrphans = async () => {
    if (!scan || scan.orphanedFiles.length === 0) return;

    setDeleting(true);
    setCleanupError('');
    setCleanupSuccess('');

    try {
      const result = await storageCleanupService.deleteCourseDocumentOrphans(
        scan.orphanedFiles.map((file) => file.path)
      );
      setConfirmCleanup(false);
      setCleanupSuccess(
        result.skippedReferencedPaths.length > 0
          ? `${result.deletedPaths.length} orphaned file(s) removed. ${result.skippedReferencedPaths.length} file(s) were skipped because they are now referenced.`
          : `${result.deletedPaths.length} orphaned file(s) removed from storage.`
      );
      setScan(await storageCleanupService.scanCourseDocumentOrphans());
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : 'Orphaned files could not be removed. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <AdminTopbar title="Settings" subtitle="Your access and site maintenance" />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <h3 className="font-display text-base font-bold text-slate-900">Your Access</h3>
          {admin ? (
            <>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-black/5 bg-cream/50 p-4">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Name</dt>
                  <dd className="mt-1 truncate text-sm font-bold text-slate-800">{admin.name}</dd>
                </div>
                <div className="rounded-xl border border-black/5 bg-cream/50 p-4">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Email</dt>
                  <dd className="mt-1 truncate text-sm font-bold text-slate-800">{admin.email}</dd>
                </div>
                <div className="rounded-xl border border-black/5 bg-cream/50 p-4">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Role</dt>
                  <dd className="mt-1 truncate text-sm font-bold capitalize text-slate-800">
                    {admin.role.replace(/_/g, ' ')}
                  </dd>
                </div>
              </dl>
              <p
                className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                  canManage
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {canManage
                    ? 'Your role can publish and edit site content, and can run storage cleanup.'
                    : 'Your role can view the portal but not publish, edit or delete site content. Ask the chairperson, vice chairperson, general secretary or webmaster to make changes.'}
                </span>
              </p>
              <p className="mt-3 text-sm text-slate-500">
                Your name and email come from the account you signed up with. Only the chairperson can change a role,
                on the{' '}
                <Link to="/portal/users" className="font-semibold text-ieee-orange hover:underline">
                  Users
                </Link>{' '}
                page.
              </p>
            </>
          ) : (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Your profile could not be read. Log out and back in to refresh it.
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <h3 className="font-display text-base font-bold text-slate-900">Site-wide Content</h3>
          <p className="mt-1 text-sm text-slate-500">These are edited on their own pages, where they are stored.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {managedElsewhere.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-start gap-3 rounded-xl border border-black/5 bg-cream/50 p-4 transition hover:border-ieee-orange/30 hover:bg-cream"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-ieee-orange" />
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            The society name, contact email and social profiles shown in the footer and on the FAQ page are fixed in the
            site itself and cannot be edited from the portal yet.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Storage Cleanup</h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Find course document files that are no longer linked to a course or course resource submission.
              </p>
            </div>
            <button
              onClick={handleScanOrphans}
              disabled={scanning}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
              Scan orphaned files
            </button>
          </div>

          {!canManage && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Only content managers can run storage cleanup.
            </p>
          )}

          {cleanupError && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {cleanupError}
            </p>
          )}

          {cleanupSuccess && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {cleanupSuccess}
            </p>
          )}

          {scan && (
            <div className="mt-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-black/5 bg-cream/50 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Bucket</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{scan.bucket}</p>
                </div>
                <div className="rounded-xl border border-black/5 bg-cream/50 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Referenced</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {scan.referencedFiles} of {scan.totalFiles} files
                  </p>
                </div>
                <div className="rounded-xl border border-black/5 bg-cream/50 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Orphaned</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{scan.orphanedFiles.length} files</p>
                </div>
              </div>

              {scan.orphanedFiles.length === 0 ? (
                <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  No orphaned course document files found.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Review these files before deleting. Files currently linked to courses or submission history are
                      protected and will be skipped.
                    </p>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-black/5">
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="sticky top-0 bg-cream text-xs uppercase tracking-widest text-slate-400">
                          <tr>
                            <th className="px-4 py-3 font-semibold">File path</th>
                            <th className="px-4 py-3 font-semibold">Size</th>
                            <th className="px-4 py-3 font-semibold">Updated</th>
                            <th className="px-4 py-3 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {scan.orphanedFiles.map((file) => (
                            <tr key={file.path} className="bg-white">
                              <td className="px-4 py-3 font-mono text-xs text-slate-700">{file.path}</td>
                              <td className="px-4 py-3 text-slate-600">{formatBytes(file.size)}</td>
                              <td className="px-4 py-3 text-slate-500">
                                {file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : 'Not available'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <a
                                  href={storageCleanupService.getCourseDocumentUrl(file.path)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    onClick={() => setConfirmCleanup(true)}
                    disabled={deleting}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete orphaned files
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <ConfirmModal
        open={confirmCleanup}
        title="Delete orphaned files?"
        description="This removes only files that are not linked to courses or course resource submissions. The system will re-check references before deleting."
        confirmLabel={deleting ? 'Deleting...' : 'Delete files'}
        danger
        onCancel={() => {
          if (!deleting) setConfirmCleanup(false);
        }}
        onConfirm={handleDeleteOrphans}
      />
    </div>
  );
}
