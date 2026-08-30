import { supabase } from '@/lib/supabase';
import type { Teacher } from '@/types';

type VerificationStatus = 'pending' | 'verified';
export type DuplicateTeacherMatch = 'email' | 'name_department';

/** Extends the shared public `Teacher` type with the fields only the admin panel needs. */
export interface AdminTeacher extends Teacher {
  verification: VerificationStatus;
  uploadedBy: string;
  uploadedDate: string;
}

interface FacultyAdminRow {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  office: string | null;
  photo_url: string | null;
  verification: VerificationStatus;
  uploaded_by: string;
  uploaded_date: string;
}

export interface SaveTeacherInput extends Omit<AdminTeacher, 'id' | 'courses'> {}

export interface DuplicateTeacherResult {
  duplicate: AdminTeacher | null;
  exists: boolean;
  match: DuplicateTeacherMatch | null;
}

export interface DuplicateTeacherCandidate {
  id?: string;
  name: string;
  department: string;
  email?: string;
}

export class DuplicateTeacherError extends Error {
  duplicate: AdminTeacher | null;
  match: DuplicateTeacherMatch | null;

  constructor(duplicate: AdminTeacher | null, match: DuplicateTeacherMatch | null) {
    super('A matching teacher already exists.');
    this.name = 'DuplicateTeacherError';
    this.duplicate = duplicate;
    this.match = match;
  }
}

export type FacultyChange =
  | { type: 'insert'; teacher: AdminTeacher }
  | { type: 'update'; teacher: AdminTeacher }
  | { type: 'delete'; id: string };

const facultyColumns = 'id,name,designation,department,email,office,photo_url,verification,uploaded_by,uploaded_date';

const toAdminTeacher = (row: FacultyAdminRow): AdminTeacher => ({
  id: row.id,
  name: row.name,
  designation: row.designation ?? '',
  department: row.department ?? '',
  email: row.email ?? '',
  office: row.office ?? '',
  courses: [],
  photo: row.photo_url ?? '',
  verification: row.verification,
  uploadedBy: row.uploaded_by,
  uploadedDate: row.uploaded_date,
});

const toPayload = (teacher: Partial<SaveTeacherInput | AdminTeacher>) => {
  const payload: Record<string, unknown> = {};
  if (teacher.name !== undefined) payload.name = teacher.name.trim();
  if (teacher.designation !== undefined) payload.designation = teacher.designation.trim();
  if (teacher.department !== undefined) payload.department = teacher.department.trim();
  if (teacher.email !== undefined) payload.email = teacher.email.trim();
  if (teacher.office !== undefined) payload.office = teacher.office.trim();
  if (teacher.verification !== undefined) payload.verification = teacher.verification;
  if (teacher.uploadedBy !== undefined) payload.uploaded_by = teacher.uploadedBy.trim() || 'IEEE CS';
  if (teacher.uploadedDate !== undefined) payload.uploaded_date = teacher.uploadedDate;
  return payload;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeDept = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function subscribeFacultyChanged(callback: (change?: FacultyChange) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const realtimeChannel = supabase.channel(`faculty-sync-${crypto.randomUUID()}`);
  const scheduleCallback = (change?: FacultyChange) => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => callback(change), 150);
  };

  realtimeChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'faculty' }, (payload) => {
      if (payload.eventType === 'INSERT') {
        scheduleCallback({ type: 'insert', teacher: toAdminTeacher(payload.new as FacultyAdminRow) });
        return;
      }

      if (payload.eventType === 'UPDATE') {
        scheduleCallback({ type: 'update', teacher: toAdminTeacher(payload.new as FacultyAdminRow) });
        return;
      }

      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Partial<FacultyAdminRow>;
        if (oldRow.id) scheduleCallback({ type: 'delete', id: oldRow.id });
        else scheduleCallback();
      }
    })
    .subscribe();

  return () => {
    if (timeout) window.clearTimeout(timeout);
    void supabase.removeChannel(realtimeChannel);
  };
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

export const facultyAdminService = {
  async list(): Promise<AdminTeacher[]> {
    const { data, error } = await supabase
      .from('faculty')
      .select(facultyColumns)
      .order('uploaded_date', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toAdminTeacher(row as FacultyAdminRow));
  },

  async get(id: string): Promise<AdminTeacher | null> {
    const { data, error } = await supabase.from('faculty').select(facultyColumns).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toAdminTeacher(data as FacultyAdminRow) : null;
  },

  async create(input: SaveTeacherInput): Promise<AdminTeacher> {
    if (!input.name.trim()) throw new Error('Please enter the teacher name.');
    if (!input.department.trim()) throw new Error('Please enter the department.');

    await refreshAuthSession();

    const { data, error } = await supabase
      .from('faculty')
      .insert(toPayload(input))
      .select(facultyColumns);

    if (error) throw new Error(error.message);

    const createdRow = (data as FacultyAdminRow[] | null)?.[0];
    if (!createdRow) {
      throw new Error('Teacher was saved, but the saved row could not be loaded. Please refresh and check the table.');
    }

    return toAdminTeacher(createdRow);
  },

  async update(id: string, patch: Partial<SaveTeacherInput>): Promise<AdminTeacher> {
    await refreshAuthSession();

    const { data, error } = await supabase
      .from('faculty')
      .update(toPayload(patch))
      .eq('id', id)
      .select(facultyColumns);

    if (error) throw new Error(error.message);

    const updatedRow = (data as FacultyAdminRow[] | null)?.[0];
    if (!updatedRow) throw new Error('No teacher was updated. Please refresh and try again.');

    return toAdminTeacher(updatedRow);
  },

  async remove(id: string): Promise<void> {
    await refreshAuthSession();
    const { error } = await supabase.from('faculty').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async findDuplicate(
    candidate: DuplicateTeacherCandidate,
    options: { verificationStatuses?: VerificationStatus[] } = {}
  ): Promise<DuplicateTeacherResult> {
    const verificationStatuses = options.verificationStatuses ?? ['pending', 'verified'];

    let query = supabase
      .from('faculty')
      .select(facultyColumns)
      .in('verification', verificationStatuses)
      .limit(1000);

    if (candidate.id) query = query.neq('id', candidate.id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const existing = ((data ?? []) as FacultyAdminRow[]).map(toAdminTeacher);
    const candidateEmail = normalizeEmail(candidate.email ?? '');
    const emailDuplicate = candidateEmail
      ? existing.find((teacher) => normalizeEmail(teacher.email) === candidateEmail)
      : null;

    if (emailDuplicate) return { duplicate: emailDuplicate, exists: true, match: 'email' };

    const candidateName = normalizeName(candidate.name);
    const candidateDepartment = normalizeDept(candidate.department);
    const nameDepartmentDuplicate =
      candidateName && candidateDepartment
        ? existing.find(
            (teacher) =>
              normalizeName(teacher.name) === candidateName &&
              normalizeDept(teacher.department) === candidateDepartment
          )
        : null;

    return {
      duplicate: nameDepartmentDuplicate ?? null,
      exists: Boolean(nameDepartmentDuplicate),
      match: nameDepartmentDuplicate ? 'name_department' : null,
    };
  },

  async verify(id: string, options: { allowPossibleDuplicate?: boolean } = {}): Promise<AdminTeacher> {
    const teacher = await this.get(id);
    if (!teacher) throw new Error('Teacher not found.');

    const { duplicate, exists, match } = await this.findDuplicate(teacher, { verificationStatuses: ['verified'] });
    if (exists && !options.allowPossibleDuplicate) {
      throw new DuplicateTeacherError(duplicate, match);
    }

    return this.update(id, { verification: 'verified' });
  },
};
