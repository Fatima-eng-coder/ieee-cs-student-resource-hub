import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, ExternalLink, FileSearch, Loader2, Save, Trash2 } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import { AdminField, AdminInput, AdminTextarea } from '@/components/admin/AdminField';
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

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [scan, setScan] = useState<CourseDocumentCleanupScan | null>(null);
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupSuccess, setCleanupSuccess] = useState('');
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const canManage = adminAuthService.canManageContent();

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

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
      <AdminTopbar title="Settings" subtitle="Society info and site-wide content" />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <h3 className="font-display text-base font-bold text-slate-900">Society Information</h3>
          <div className="mt-4 flex flex-col gap-4">
            <AdminField label="Society Name">
              <AdminInput defaultValue="IEEE Computer Society Islamabad Branch Chapter" />
            </AdminField>
            <AdminField label="Contact Email">
              <AdminInput defaultValue="ieeecs.studentbranch@example.edu" />
            </AdminField>
            <AdminField label="Instagram URL">
              <AdminInput defaultValue="https://instagram.com" />
            </AdminField>
            <AdminField label="LinkedIn URL">
              <AdminInput defaultValue="https://linkedin.com" />
            </AdminField>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
        >
          <h3 className="font-display text-base font-bold text-slate-900">Announcement Ticker</h3>
          <p className="mt-1 text-sm text-slate-500">One line per item — shown in the scrolling ticker on the homepage.</p>
          <AdminTextarea
            defaultValue={
              'IEEE CS Workshop registrations are now open.\nPast paper contribution drive is live.\nCS Block navigation beta is available.'
            }
            className="mt-3 min-h-28"
          />
        </motion.div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.3)] transition hover:bg-ieee-orange-dark"
          >
            <Save className="h-4 w-4" /> Save Settings
          </button>
          <AnimatePresence>
            {saved && (
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-sm font-medium text-emerald-600"
              >
                <Check className="h-4 w-4" /> Saved (prototype only)
              </motion.p>
            )}
          </AnimatePresence>
        </div>

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
