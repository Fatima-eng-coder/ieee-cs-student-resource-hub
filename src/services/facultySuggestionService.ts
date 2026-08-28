import { supabase } from '@/lib/supabase';
import { facultyService } from '@/services/facultyService';

export type FacultySuggestionType =
  | 'new_teacher'
  | 'email_update'
  | 'office_update'
  | 'profile_update'
  | 'course_assignment';

export type FacultySuggestionStatus = 'pending' | 'approved' | 'rejected';
type ReviewStatus = Extract<FacultySuggestionStatus, 'approved' | 'rejected'>;

export interface FacultySuggestionCourse {
  course_id: string;
  course_code: string;
  course_name: string;
}

export interface FacultySuggestionInput {
  facultyId?: string;
  teacherName: string;
  email: string;
  department: string;
  designation: string;
  office: string;
  assignedCourses?: FacultySuggestionCourse[];
  suggestionType: FacultySuggestionType;
  notes: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
}

export interface FacultySuggestion {
  id: string;
  facultyId: string | null;
  teacherName: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  office: string | null;
  courseCode: string | null;
  courseName: string | null;
  suggestionType: FacultySuggestionType;
  notes: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  submittedBy: string | null;
  status: FacultySuggestionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface FacultySuggestionReviewResult {
  suggestion: FacultySuggestion;
}

interface FacultySuggestionRow {
  id: string;
  faculty_id: string | null;
  teacher_name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  office: string | null;
  course_code: string | null;
  course_name: string | null;
  suggestion_type: FacultySuggestionType;
  notes: string | null;
  requester_name: string | null;
  requester_email: string | null;
  submitted_by: string | null;
  status: FacultySuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const suggestionColumns =
  'id,faculty_id,teacher_name,email,department,designation,office,course_code,course_name,suggestion_type,notes,requester_name,requester_email,submitted_by,status,reviewed_by,reviewed_at,created_at';

const toFacultySuggestion = (row: FacultySuggestionRow): FacultySuggestion => ({
  id: row.id,
  facultyId: row.faculty_id,
  teacherName: row.teacher_name,
  email: row.email,
  department: row.department,
  designation: row.designation,
  office: row.office,
  courseCode: row.course_code,
  courseName: row.course_name,
  suggestionType: row.suggestion_type,
  notes: row.notes,
  requesterName: row.requester_name,
  requesterEmail: row.requester_email,
  submittedBy: row.submitted_by,
  status: row.status,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
});

const friendlySubmitError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('faculty_suggestions') && lower.includes('does not exist')) {
    return 'Teacher info suggestions are not enabled yet. Please create the faculty_suggestions table first.';
  }

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Your teacher info suggestion could not be saved because access rules blocked it. Please refresh and try again.';
  }

  if (lower.includes('check constraint')) {
    return 'Please review the suggestion type and status before submitting.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Teacher info could not be submitted right now. Please try again.';
};

const friendlyAdminError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'You do not have permission to review teacher info suggestions.';
  }

  if (lower.includes('faculty_suggestions') && lower.includes('does not exist')) {
    return 'Teacher info suggestions are not enabled yet. Please create the faculty_suggestions table first.';
  }

  if (lower.includes('course_teachers') && lower.includes('does not exist')) {
    return 'Course faculty assignments need the course_teachers table before this suggestion can be approved.';
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  return 'Teacher info suggestions could not be reviewed right now. Please try again.';
};

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function validateSuggestion(input: FacultySuggestionInput): void {
  const teacherName = input.teacherName.trim();
  const email = input.email.trim();
  const office = input.office.trim();
  const designation = input.designation.trim();
  const department = input.department.trim();
  const notes = input.notes.trim();
  const hasCourse = Boolean(input.assignedCourses?.length);

  if (!teacherName) throw new Error('Please enter the teacher name.');
  if (email && !validEmail(email)) throw new Error('Please enter a valid email address.');

  const hasUsefulSuggestion = Boolean(email || office || designation || department || notes || hasCourse);
  if (!hasUsefulSuggestion) {
    throw new Error('Please provide at least one useful detail before submitting.');
  }

  if (input.suggestionType === 'email_update' && !email) {
    throw new Error('Please enter the email address you want to suggest.');
  }

  if (input.suggestionType === 'office_update' && !office) {
    throw new Error('Please enter the office or location you want to suggest.');
  }

  if (input.suggestionType === 'course_assignment' && !hasCourse) {
    throw new Error('Please select the course assignment you want to suggest.');
  }
}

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

function notesWithExtraCourses(notes: string, courses: FacultySuggestionCourse[]): string | null {
  if (courses.length <= 1) return notes || null;
  const courseList = courses.map((course) => `${course.course_code} - ${course.course_name}`).join(', ');
  return notes ? `${notes}\n\nAdditional assigned courses: ${courseList}` : `Additional assigned courses: ${courseList}`;
}

async function updateSuggestionStatus(id: string, status: ReviewStatus): Promise<FacultySuggestion> {
  await refreshAuthSession();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('faculty_suggestions')
    .update({
      status,
      reviewed_by: userData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(suggestionColumns)
    .single();

  if (error) throw new Error(friendlyAdminError(error.message));
  return toFacultySuggestion(data as FacultySuggestionRow);
}

async function updateFacultyFromSuggestion(suggestion: FacultySuggestion): Promise<void> {
  const facultyId = suggestion.facultyId;
  const trimmedEmail = suggestion.email?.trim() ?? '';
  const trimmedOffice = suggestion.office?.trim() ?? '';
  const trimmedName = suggestion.teacherName.trim();
  const trimmedDepartment = suggestion.department?.trim() ?? '';
  const trimmedDesignation = suggestion.designation?.trim() ?? '';

  if (suggestion.suggestionType === 'new_teacher') {
    const { data, error } = await supabase
      .from('faculty')
      .insert({
        name: trimmedName,
        email: trimmedEmail || null,
        department: trimmedDepartment || null,
        designation: trimmedDesignation || null,
        office: trimmedOffice || null,
      })
      .select('id')
      .single();

    if (error) throw new Error(friendlyAdminError(error.message));
    const createdFacultyId = (data as { id?: string } | null)?.id;
    if (createdFacultyId && suggestion.courseCode) {
      await facultyService.addCourseTeacher(suggestion.courseCode, createdFacultyId);
    }
    return;
  }

  if (!facultyId) {
    throw new Error('This suggestion is not linked to an existing faculty member.');
  }

  if (suggestion.suggestionType === 'email_update') {
    if (!trimmedEmail) throw new Error('This email suggestion does not include an email address.');
    const { error } = await supabase.from('faculty').update({ email: trimmedEmail }).eq('id', facultyId);
    if (error) throw new Error(friendlyAdminError(error.message));
    return;
  }

  if (suggestion.suggestionType === 'office_update') {
    if (!trimmedOffice) throw new Error('This office suggestion does not include an office or location.');
    const { error } = await supabase.from('faculty').update({ office: trimmedOffice }).eq('id', facultyId);
    if (error) throw new Error(friendlyAdminError(error.message));
    return;
  }

  if (suggestion.suggestionType === 'profile_update') {
    const payload: Record<string, string | null> = {};
    if (trimmedName) payload.name = trimmedName;
    if (trimmedEmail) payload.email = trimmedEmail;
    if (trimmedDepartment) payload.department = trimmedDepartment;
    if (trimmedDesignation) payload.designation = trimmedDesignation;
    if (trimmedOffice) payload.office = trimmedOffice;

    if (Object.keys(payload).length === 0) {
      throw new Error('This profile suggestion does not include any faculty details to approve.');
    }

    const { error } = await supabase.from('faculty').update(payload).eq('id', facultyId);
    if (error) throw new Error(friendlyAdminError(error.message));
    return;
  }

  if (suggestion.suggestionType === 'course_assignment') {
    if (!suggestion.courseCode) {
      throw new Error('This course assignment suggestion does not include a course.');
    }

    await facultyService.addCourseTeacher(suggestion.courseCode, facultyId);
  }
}

export const facultySuggestionService = {
  async submit(input: FacultySuggestionInput): Promise<void> {
    validateSuggestion(input);
    const { data: userData } = await supabase.auth.getUser();
    const primaryCourse = input.assignedCourses?.[0] ?? null;
    const notes = notesWithExtraCourses(input.notes.trim(), input.assignedCourses ?? []);

    const { error } = await supabase.from('faculty_suggestions').insert({
      faculty_id: input.facultyId || null,
      teacher_name: input.teacherName.trim(),
      email: input.email.trim() || null,
      department: input.department.trim() || null,
      designation: input.designation.trim() || null,
      office: input.office.trim() || null,
      course_code: primaryCourse?.course_code ?? null,
      course_name: primaryCourse?.course_name ?? null,
      suggestion_type: input.suggestionType,
      notes,
      requester_name: input.requesterName?.trim() || null,
      requester_email: input.requesterEmail?.trim() || null,
      submitted_by: userData.user?.id ?? null,
      status: 'pending',
    });

    if (error) throw new Error(friendlySubmitError(error.message));
  },

  async listForAdmin(): Promise<FacultySuggestion[]> {
    const { data, error } = await supabase
      .from('faculty_suggestions')
      .select(suggestionColumns)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyAdminError(error.message));
    return ((data ?? []) as FacultySuggestionRow[]).map(toFacultySuggestion);
  },

  async approve(suggestion: FacultySuggestion): Promise<FacultySuggestionReviewResult> {
    await refreshAuthSession();
    await updateFacultyFromSuggestion(suggestion);
    const updated = await updateSuggestionStatus(suggestion.id, 'approved');
    return { suggestion: updated };
  },

  async reject(suggestion: FacultySuggestion): Promise<FacultySuggestionReviewResult> {
    await refreshAuthSession();
    const updated = await updateSuggestionStatus(suggestion.id, 'rejected');
    return { suggestion: updated };
  },
};
