import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Search, UserCog } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import AdminEditDrawer from '@/components/admin/AdminEditDrawer';
import { AdminField, AdminInput, AdminSelect } from '@/components/admin/AdminField';
import Avatar from '@/components/ui/Avatar';
import { useProfiles } from '@/hooks/useProfiles';
import { adminAuthService } from '@/services/adminAuthService';
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

  const currentAdmin = adminAuthService.getCurrentAdmin();
  const canManageRoles = currentAdmin?.role === 'chairperson';

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

  const handleSaveRole = async () => {
    if (!editing) return;
    setNotice(null);
    setError(null);

    if (!canManageRoles) {
      setError('Only the chairperson can manage team access.');
      return;
    }

    if (editing.id === currentAdmin?.id && draftRole !== 'chairperson') {
      setError('You cannot remove your own chairperson access from this page.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateRole(editing.id, draftRole);
      setNotice(`${updated.name}'s access was updated to ${roleLabels[updated.role]}.`);
      setEditing(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Role update failed.';
      setError(
        /permission|policy|rls/i.test(message)
          ? 'You are not allowed to manage roles. Only the chairperson can update team access.'
          : message,
      );
    } finally {
      setSaving(false);
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

  const searchReady = query.trim().length >= 2;

  return (
    <div>
      <AdminTopbar
        title="Team Access"
        subtitle="Manage society members with portal access"
        action={
          <button
            onClick={() => {
              if (!canManageRoles) setError('Only the chairperson can manage team access.');
              document.getElementById('student-access-search')?.focus();
            }}
            className="flex items-center gap-1.5 rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            <UserCog className="h-4 w-4" /> Manage Access
          </button>
        }
      />

      <div className="p-4 sm:p-6">
        {error && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.error}`}>{error}</div>
        )}
        {notice && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.success}`}>
            {notice}
          </div>
        )}
        {!canManageRoles && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${messageClass.info}`}>
            You can view team access here. Only the chairperson can promote or demote users.
          </div>
        )}

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

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-black/5 bg-white px-6 py-16 text-slate-500 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading team access...
          </div>
        ) : (
          <AdminTable
            columns={columns}
            rows={coreTeam}
            rowKey={(profile) => profile.id}
            searchable={(profile) => `${profile.name} ${profile.email} ${profile.role}`}
            emptyTitle="No team members found"
            emptyMessage="Core team profiles will appear here once roles are assigned."
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
    </div>
  );
}
