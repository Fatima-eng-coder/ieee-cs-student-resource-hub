import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Download, Loader2, Pencil, RefreshCw, Search, ShieldAlert, Trash2, UserCog } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import Avatar from '@/components/ui/Avatar';
import { useProfiles } from '@/hooks/useProfiles';
import { adminAuthService } from '@/services/adminAuthService';
import { profilesService, type DirectoryProfile } from '@/services/profilesService';
import { CONTENT_MANAGER_ROLES } from '@/types';
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/utils/csv';
import { SOCIETY_ROLES, type Profile, type ProfileRole } from '@/types';

const teamRoles = [...SOCIETY_ROLES] as ProfileRole[];
const editableRoles: ProfileRole[] = ['student', ...teamRoles];

const roleLabels: Record<ProfileRole, string> = {
  student: 'Student',
  webmaster: 'Webmaster',
  chairperson: 'Chairperson',
  vice_chairperson: 'Vice Chairperson',
  general_secretary: 'General Secretary',
  joint_secretary: 'Joint Secretary',
  graphic_designer: 'Graphic Designer',
  operations_manager: 'Operations Manager',
  treasurer: 'Treasurer',
};

type RosterView = 'team' | 'students' | 'all';

const rosterViews: { id: RosterView; label: string }[] = [
  { id: 'team', label: 'Team Access' },
  { id: 'students', label: 'Students' },
  { id: 'all', label: 'Everyone' },
];

const actionBtn =
  'flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-black/5 disabled:hover:text-slate-600';

const messageClass = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-amber-200 bg-amber-50 text-amber-800',
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/** Excel sorts YYYY-MM-DD as a date; the display format above it treats as text. */
function csvDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function accessDescription(role: ProfileRole) {
  if (role === 'student') return 'No portal access';
  if (['webmaster', 'chairperson', 'vice_chairperson', 'general_secretary'].includes(role)) {
    return 'Portal access and content changes';
  }
  return 'Portal access only';
}

function roleBadge(role: ProfileRole) {
  const isStudent = role === 'student';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isStudent ? 'bg-slate-100 text-slate-600' : 'bg-ieee-orange/10 text-ieee-orange'
      }`}
    >
      {roleLabels[role]}
    </span>
  );
}

/** A blank contact field is a gap in the student's own profile, not an error. */
function optionalCell(value: string): ReactNode {
  return value ? value : <span className="text-slate-300">—</span>;
}

const rosterCsvColumns: CsvColumn<DirectoryProfile>[] = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'University Email' },
  { key: 'secondaryEmail', header: 'Secondary Email' },
  { key: 'whatsapp', header: 'WhatsApp' },
  { key: 'className', header: 'Class' },
  { key: 'section', header: 'Section' },
  { key: 'degree', header: 'Degree' },
  { key: 'role', header: 'Role', value: (profile) => roleLabels[profile.role] },
  { key: 'createdAt', header: 'Joined', value: (profile) => csvDate(profile.createdAt) },
];

export default function AdminUsersPage() {
  const {
    coreTeam,
    studentResults,
    loading,
    searching,
    error,
    setError,
    searchStudents,
    updateRole,
  } = useProfiles();
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [draftRole, setDraftRole] = useState<ProfileRole>('student');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<RosterView>('team');
  const [roster, setRoster] = useState<DirectoryProfile[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [deleting, setDeleting] = useState<DirectoryProfile | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  // Handing over chairperson revokes the caller's own access, so it is confirmed separately
  // rather than happening the instant they press Save.
  const [confirmHandover, setConfirmHandover] = useState(false);
  const navigate = useNavigate();

  const currentAdmin = adminAuthService.getCurrentAdmin();
  const canManageRoles = currentAdmin?.role === 'chairperson';
  // The roster carries phone numbers and personal emails, so it follows the
  // same boundary the database enforces on the profiles table itself.
  const canReadProfiles = adminAuthService.canManageContent();

  useEffect(() => {
    if (!canReadProfiles || view === 'team') return;

    let cancelled = false;
    setRosterLoading(true);
    setRosterError(null);

    const request = view === 'students' ? profilesService.listStudents() : profilesService.listAll();
    request
      .then((rows) => {
        if (!cancelled) setRoster(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setRoster([]);
        setRosterError(err instanceof Error ? err.message : 'Could not load the roster.');
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, canReadProfiles, reloadToken]);

  // The search box exists only on the team view, so the topbar shortcut can
  // reach it only after React has rendered that view back in.
  useEffect(() => {
    if (focusRequest === 0 || view !== 'team') return;
    document.getElementById('student-access-search')?.focus();
  }, [focusRequest, view]);

  const openAccessDrawer = useCallback((profile: Profile) => {
    setEditing(profile);
    setDraftRole(profile.role);
    setError(null);
    setNotice(null);
  }, [setError]);

  const handleSearch = async () => {
    setNotice(null);
    setHasSearched(true);

    if (!canManageRoles) {
      setError('Only the chairperson can manage team access.');
      return;
    }

    await searchStudents(query);
  };

  const handleDownloadCsv = () => {
    downloadCsv(
      csvFilename(view === 'all' ? 'roster' : 'students'),
      toCsv(roster, rosterCsvColumns),
    );
  };

  const handleSaveRole = async () => {
    if (!editing) return;
    setNotice(null);
    setError(null);

    if (!canManageRoles) {
      setError('Only the chairperson can manage team access.');
      return;
    }

    // assign_portal_role() refuses this too. Checked here as well so the answer is instant and
    // says what to do instead, rather than a round trip to be told no.
    if (editing.id === currentAdmin?.id) {
      setError(
        'You cannot change your own role. To step down, give Chairperson to whoever is taking over — that hands it across in one move.',
      );
      return;
    }

    // Giving somebody else chairperson also takes it off the person doing it. Asking first is
    // the difference between handing the role over and discovering you no longer have it.
    if (draftRole === 'chairperson' && !confirmHandover) {
      setConfirmHandover(true);
      return;
    }

    setSaving(true);
    try {
      const assignment = await updateRole(editing.id, draftRole);

      // A handover demoted the person who just pressed the button, so it says so rather than
      // reporting a routine change and leaving them to discover it on the next page they open.
      setNotice(
        assignment.handover
          ? `${assignment.name} is now the chairperson. You have handed the role over, so your own access is now Student.`
          : `${assignment.name}'s access was updated to ${roleLabels[assignment.newRole]}.`,
      );
      setEditing(null);
      setConfirmHandover(false);
      setReloadToken((token) => token + 1);

      if (assignment.handover) {
        /*
         * The caller is a student as of a moment ago, and their portal session is now a
         * fiction. loadCurrentAdmin() re-reads the profile, finds it can no longer reach the
         * portal, and signs them out — it throws to say so, which is the expected path here
         * rather than a failure.
         *
         * Without this they kept a working-looking admin panel until they happened to navigate,
         * which is the one moment a handover must not be ambiguous about who is in charge.
         */
        await adminAuthService.loadCurrentAdmin().catch(() => undefined);
        navigate('/portal/login', {
          replace: true,
          state: { notice: `You handed chairperson to ${assignment.name}. Your portal access ended with it.` },
        });
        return;
      }
    } catch (err) {
      // The database's own refusals are written to be read — "Only the chairperson can assign
      // portal roles", "You cannot change your own role" — so they are shown as they came
      // rather than flattened into one sentence that fits none of them.
      const message = err instanceof Error ? err.message : 'Role update failed.';
      setError(message);
    } finally {
      setSaving(false);
      setConfirmHandover(false);
    }
  };

  /**
   * Deleting is irreversible and the rows around it are not: the student's uploads, requests
   * and registrations all survive and come back to them if they sign up again on the same
   * address. That is the sentence the admin needs before they confirm, so the count of what
   * survives is reported afterwards rather than left implicit.
   */
  const handleDeleteAccount = async () => {
    if (!deleting) return;
    setNotice(null);
    setRosterError(null);
    setDeletingAccount(true);

    try {
      const summary = await profilesService.deleteStudentAccount(deleting.id);
      setNotice(
        summary.contributionsKept > 0
          ? `${summary.name}'s account was deleted. ${summary.contributionsKept} ${
              summary.contributionsKept === 1 ? 'contribution was' : 'contributions were'
            } kept and will return to them if they sign up again with ${summary.email}.`
          : `${summary.name}'s account was deleted. They had no contributions to keep.`,
      );
      setDeleting(null);
      setDeleteConfirmation('');
      setReloadToken((token) => token + 1);
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : 'That account could not be deleted.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const columns = useMemo<AdminTableColumn<Profile>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        sortValue: (profile) => profile.name,
        render: (profile) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={profile.name} size="sm" />
            <span className="font-medium text-slate-900">{profile.name}</span>
          </div>
        ),
      },
      {
        key: 'email',
        header: 'Email',
        sortValue: (profile) => profile.email,
        render: (profile) => profile.email,
      },
      {
        key: 'role',
        header: 'Role',
        sortValue: (profile) => profile.role,
        render: (profile) => roleBadge(profile.role),
      },
      {
        key: 'access',
        header: 'Access',
        sortValue: (profile) => accessDescription(profile.role),
        render: (profile) => <span className="text-slate-500">{accessDescription(profile.role)}</span>,
      },
      {
        key: 'createdAt',
        header: 'Joined',
        sortValue: (profile) => profile.createdAt,
        render: (profile) => formatDate(profile.createdAt),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (profile) =>
          canManageRoles ? (
            <button className={actionBtn} onClick={() => openAccessDrawer(profile)}>
              <Pencil className="h-3.5 w-3.5" /> Update Access
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-400">Read only</span>
          ),
      },
    ],
    [canManageRoles, openAccessDrawer],
  );

  const rosterColumns = useMemo<AdminTableColumn<DirectoryProfile>[]>(() => {
    const base: AdminTableColumn<DirectoryProfile>[] = [
      {
        key: 'name',
        header: 'Name',
        sortValue: (profile) => profile.name,
        render: (profile) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={profile.name} size="sm" />
            <span className="font-medium text-slate-900">{profile.name}</span>
          </div>
        ),
      },
      {
        key: 'email',
        header: 'University Email',
        sortValue: (profile) => profile.email,
        render: (profile) => optionalCell(profile.email),
      },
      {
        key: 'secondaryEmail',
        header: 'Secondary Email',
        sortValue: (profile) => profile.secondaryEmail,
        render: (profile) => optionalCell(profile.secondaryEmail),
      },
      {
        key: 'whatsapp',
        header: 'WhatsApp',
        sortValue: (profile) => profile.whatsapp,
        render: (profile) => optionalCell(profile.whatsapp),
      },
      {
        key: 'className',
        header: 'Class',
        sortValue: (profile) => profile.className,
        render: (profile) => optionalCell(profile.className),
      },
      {
        key: 'section',
        header: 'Section',
        sortValue: (profile) => profile.section,
        render: (profile) => optionalCell(profile.section),
      },
      {
        key: 'degree',
        header: 'Degree',
        sortValue: (profile) => profile.degree,
        render: (profile) => optionalCell(profile.degree),
      },
    ];

    if (view === 'all') {
      base.push({
        key: 'role',
        header: 'Role',
        sortValue: (profile) => profile.role,
        render: (profile) => roleBadge(profile.role),
      });
    }

    base.push({
      key: 'createdAt',
      header: 'Joined',
      sortValue: (profile) => profile.createdAt,
      render: (profile) => formatDate(profile.createdAt),
    });

    base.push({
      key: 'account',
      header: '',
      render: (profile) => {
        // The database refuses both of these too (delete_student_account raises 42501 for the
        // caller's own row and for any content manager). Mirrored here so the button is not
        // offered for something that would only fail.
        const isSelf = profile.id === currentAdmin?.id;
        const managesContent = (CONTENT_MANAGER_ROLES as readonly ProfileRole[]).includes(profile.role);
        const blocked = isSelf || managesContent;

        return (
          <button
            type="button"
            onClick={() => {
              setDeleting(profile);
              setDeleteConfirmation('');
              setNotice(null);
              setRosterError(null);
            }}
            disabled={blocked}
            title={
              isSelf
                ? 'You cannot delete your own account'
                : managesContent
                  ? 'Change this role away from the committee before deleting the account'
                  : `Delete ${profile.name}'s account`
            }
            className="flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-black/5 disabled:hover:text-slate-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        );
      },
    });

    return base;
  }, [view, currentAdmin?.id]);

  const searchReady = query.trim().length >= 2;

  if (!canReadProfiles) {
    return (
      <div>
        <AdminTopbar title="Team Access" subtitle="Manage society members with portal access" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">You do not have access</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Student profiles hold personal contact details, so only the webmaster, chairperson, vice chairperson and
              general secretary can open this page. Ask one of them if you need the roster.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminTopbar
        title="Team Access"
        subtitle="Manage society members with portal access"
        action={
          <button
            onClick={() => {
              if (!canManageRoles) setError('Only the chairperson can manage team access.');
              setView('team');
              setFocusRequest((request) => request + 1);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            <UserCog className="h-4 w-4" /> Manage Access
          </button>
        }
      />

      <div className="p-4 sm:p-6">
        {/* Both banners describe the team table and its drawer, and the roster
            views report their own failures — showing them everywhere prints the
            same permission message twice. */}
        {error && view === 'team' && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.error}`}>{error}</div>
        )}
        {notice && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.success}`}>
            {notice}
          </div>
        )}
        {!canManageRoles && view === 'team' && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.info}`}>
            You can view team access here. Only the chairperson can promote or demote users.
          </div>
        )}

        {view === 'team' && (
          <section className="mb-6 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="font-display text-lg font-bold text-slate-900">Find Student</h2>
              <p className="text-sm text-slate-500">
                Search existing student profiles by name or email before updating access.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <AdminInput
                  id="student-access-search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHasSearched(false);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSearch();
                  }}
                  placeholder="Search student name or email..."
                  className="pl-9"
                  disabled={!canManageRoles}
                />
              </div>
              <button
                onClick={() => void handleSearch()}
                disabled={!canManageRoles || !searchReady || searching}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>

            {hasSearched && canManageRoles && !searching && studentResults.length === 0 && (
              <p className="mt-3 rounded-xl border border-black/5 bg-cream/70 px-4 py-3 text-sm font-medium text-slate-600">
                No matching student found.
              </p>
            )}

            {studentResults.length > 0 && (
              <div className="mt-4 divide-y divide-black/[0.04] overflow-hidden rounded-xl border border-black/5">
                {studentResults.map((profile) => (
                  <div key={profile.id} className="flex flex-col gap-3 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={profile.name} size="sm" />
                      <div>
                        <p className="font-semibold text-slate-900">{profile.name}</p>
                        <p className="text-sm text-slate-500">{profile.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {roleBadge(profile.role)}
                      <button className={actionBtn} onClick={() => openAccessDrawer(profile)}>
                        <UserCog className="h-3.5 w-3.5" /> Update Access
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl border border-black/5 bg-white p-1 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            {rosterViews.map((option) => (
              <button
                key={option.id}
                onClick={() => setView(option.id)}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  view === option.id
                    ? 'bg-ieee-orange text-white shadow-sm'
                    : 'text-slate-500 hover:text-ieee-orange'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {view !== 'team' && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-400">{roster.length} profiles</span>
              <button
                onClick={() => setReloadToken((token) => token + 1)}
                disabled={rosterLoading}
                className={actionBtn}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rosterLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                onClick={handleDownloadCsv}
                disabled={rosterLoading || roster.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" /> Download CSV
              </button>
            </div>
          )}
        </div>

        {rosterError && view !== 'team' && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.error}`}>
            {rosterError}
          </div>
        )}

        {(view === 'team' ? loading : rosterLoading) ? (
          <div className="flex items-center justify-center rounded-2xl border border-black/5 bg-white px-6 py-16 text-slate-500 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {view === 'team' ? 'Loading team access...' : 'Loading roster...'}
          </div>
        ) : view === 'team' ? (
          <AdminTable
            columns={columns}
            rows={coreTeam}
            rowKey={(profile) => profile.id}
            searchable={(profile) => `${profile.name} ${profile.email} ${profile.role}`}
            emptyTitle="No team members found"
            emptyMessage="Core team profiles will appear here once roles are assigned."
          />
        ) : (
          <AdminTable
            columns={rosterColumns}
            rows={roster}
            rowKey={(profile) => profile.id}
            pageSize={10}
            searchable={(profile) =>
              `${profile.name} ${profile.email} ${profile.secondaryEmail} ${profile.whatsapp} ${profile.className} ${profile.section} ${profile.degree} ${roleLabels[profile.role]}`
            }
            emptyTitle={
              rosterError
                ? 'Roster unavailable'
                : view === 'students'
                  ? 'No students registered yet'
                  : 'No profiles found'
            }
            emptyMessage={
              rosterError
                ? 'The roster could not be read. See the message above.'
                : 'Profiles appear here as soon as students sign up for an account.'
            }
          />
        )}
      </div>

      <AdminEditDrawer
        open={!!editing}
        title="Update Access"
        subtitle="Change an existing profile role. This does not create auth users."
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        footer={
          <button
            onClick={() => void handleSaveRole()}
            disabled={!canManageRoles || saving || !editing || draftRole === editing.role}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Access
          </button>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex items-center gap-3">
                <Avatar name={editing.name} size="md" />
                <div>
                  <p className="font-display text-base font-bold text-slate-900">{editing.name}</p>
                  <p className="text-sm text-slate-500">{editing.email}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {roleBadge(editing.role)}
                <span>{accessDescription(editing.role)}</span>
              </div>
            </div>

            <AdminField label="Role">
              <AdminSelect
                value={draftRole}
                onChange={(event) => setDraftRole(event.target.value as ProfileRole)}
                disabled={!canManageRoles}
              >
                {editableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>

            <p className="rounded-xl bg-cream/70 px-3 py-2 text-xs text-slate-500">
              Students cannot access the portal. Core team roles can enter the portal; only Webmaster, Chairperson, Vice
              Chairperson, and General Secretary can change content.
            </p>
          </div>
        )}
      </AdminEditDrawer>

      <ConfirmModal
        open={confirmHandover}
        danger
        title="Hand over chairperson?"
        description={
          editing
            ? `${editing.name} becomes chairperson, and your own role becomes Student in the same move — only one person holds it at a time. You will be signed out of the portal immediately and only ${editing.name} will be able to give it back.`
            : ''
        }
        confirmLabel={saving ? 'Handing over…' : 'Hand over and sign out'}
        cancelLabel="Keep the role"
        onConfirm={() => void handleSaveRole()}
        onCancel={() => setConfirmHandover(false)}
      />

      <DeleteAccountModal
        profile={deleting}
        confirmation={deleteConfirmation}
        onConfirmationChange={setDeleteConfirmation}
        busy={deletingAccount}
        onCancel={() => {
          if (deletingAccount) return;
          setDeleting(null);
          setDeleteConfirmation('');
        }}
        onConfirm={() => void handleDeleteAccount()}
      />
    </div>
  );
}

/**
 * A bespoke confirm rather than the shared ConfirmModal, for two reasons: this action cannot
 * be undone from anywhere in the app, and what it does NOT delete is the part an admin most
 * needs to read before agreeing. Typing the address is the friction — a misplaced click on a
 * row cannot get through it, and the address is on screen so it costs a careful person only a
 * moment.
 */
function DeleteAccountModal({
  profile,
  confirmation,
  onConfirmationChange,
  busy,
  onCancel,
  onConfirm,
}: {
  profile: DirectoryProfile | null;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const expected = profile?.email.trim().toLowerCase() ?? '';
  const matches = expected.length > 0 && confirmation.trim().toLowerCase() === expected;

  return (
    <AnimatePresence>
      {profile && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ieee-ink/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Delete {profile.name}&rsquo;s account?
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Their login is removed for good. They can sign up again with the same university
                  address, and everything they contributed comes back to them when they do.
                </p>
              </div>
            </div>

            <ul className="mt-4 flex flex-col gap-1.5 rounded-xl bg-cream/70 px-3.5 py-3 text-xs text-slate-600">
              <li>· Past papers, resource suggestions and event photos they sent are kept.</li>
              <li>· Their form registrations are kept, with their email still on them.</li>
              <li>· They lose access immediately and any open session ends.</li>
            </ul>

            <label className="mt-4 block text-xs font-semibold text-slate-600">
              Type <span className="font-mono text-slate-800">{profile.email}</span> to confirm
              <input
                autoFocus
                value={confirmation}
                onChange={(event) => onConfirmationChange(event.target.value)}
                placeholder={profile.email}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
              />
            </label>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!matches || busy}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
