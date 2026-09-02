// Shared domain types. These mirror the shape a future REST/GraphQL API would return,
// so swapping dummy JSON for real fetch calls should not require changing consumers.

export type VerificationStatus = 'verified' | 'unverified' | 'pending';

export interface Announcement {
  id: string;
  title: string;
  summary: string;
  body: string;
  date: string;
  category: 'general' | 'event' | 'academic' | 'navigation' | 'projects';
  pinned?: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  ctaLabel: string;
  ctaLink: string;
  type: 'sponsor' | 'workshop' | 'announcement' | 'partner' | 'campaign';
}

export type EventCategory = 'workshop' | 'competition' | 'seminar' | 'session' | 'hackathon' | 'other';
export type EventTiming = 'upcoming' | 'previous' | 'featured';
export type EventImageLayout = 'poster' | 'banner';

export interface EventOutcome {
  attendees: number;
  highlights: string[];
  gallery?: string[];
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  date: string;
  time: string;
  venue: string;
  category: EventCategory;
  timing: EventTiming;
  featured?: boolean;
  imageLayout?: EventImageLayout;
  registrationOpen: boolean;
  registrationUrl?: string;
  capacity: number;
  registered: number;
  image: string;
  organizers: string[];
  outcome?: EventOutcome;
  /** Optional custom registration form (built in the Forms module). */
  registrationFormId?: string;
}

export interface Paper {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  session: string;
  year: number;
  examType: 'Midterm' | 'Final' | 'Quiz' | 'Assignment';
  instructor: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedDate: string;
  verification: VerificationStatus;
  tags: string[];
  downloads: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  /** Theory/lecture hours from the credit structure. */
  theoryHours?: number;
  /** Lab/contact hours from the credit structure. 0 means this is not lab-based. */
  labHours?: number;
  department: string;
  description: string;
  outcomes: string[];
  cdfUrl?: string;
  cdfPath?: string | null;
  labManualUrl?: string;
  labManualPath?: string | null;
  teacherIds: string[];
  /** Course codes this course requires beforehand. */
  prerequisites?: string[];
  usefulLinks: { label: string; url: string }[];
  tips: string[];
}

/** Degree programs offered — used to scope date sheets. */
export const PROGRAMS = [
  'Computer Science',
  'Software Engineering',
  'Artificial Intelligence',
  'Data Science',
  'Cyber Security',
] as const;
export type Program = (typeof PROGRAMS)[number];

export interface DateSheet {
  id: string;
  title: string;
  /** Degree program / major this sheet belongs to. */
  program: Program;
  semester: number;
  /** e.g. "Fall", "Spring". */
  term: string;
  year: number;
  /** Uploaded file (data URL / image / PDF). Empty when not uploaded. */
  fileUrl: string;
  uploadedDate: string;
}

export interface Teacher {
  id: string;
  name: string;
  designation: string;
  department: string;
  email: string;
  office: string;
  courses: string[];
  photo: string;
}

export interface RouteEntrance {
  id: string;
  name: string;
  description: string;
}

export interface DestinationType {
  id: string;
  label: string;
  icon: string;
}

export interface Destination {
  id: string;
  name: string;
  typeId: string;
  floor: string;
  description: string;
}

export interface RouteStep {
  order: number;
  instruction: string;
}

export interface RouteInfo {
  id: string;
  entranceId: string;
  destinationId: string;
  steps: RouteStep[];
  estimatedTimeMinutes: number;
}

export interface ProjectItem {
  id: string;
  title: string;
  tagline: string;
  problem: string;
  solution: string;
  features: string[];
  team: { name: string; role: string }[];
  supervisor: string;
  techStack: string[];
  screenshots: string[];
  demoUrl?: string;
  githubUrl?: string;
  learnings: string[];
  category: string;
  year: number;
  verification: VerificationStatus;
}

// --- Accounts & the Projects social module -------------------------------
// These mirror what a real auth/projects API will return. The service layer in
// src/services swaps its localStorage bodies for fetch() calls without any
// consumer changes.

export interface User {
  id: string;
  name: string;
  email: string;
  /** Optional avatar URL; when empty the UI renders initials. */
  avatar: string;
  createdAt: string;
}

export interface ProjectComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  createdAt: string;
}

/**
 * A shared student project post (the "Projects" social module). Likes and
 * reposts track the account ids that performed them so they can be toggled per
 * user; base* fields carry seeded popularity so counts/sorting work before any
 * real accounts exist.
 */
export interface ProjectPost {
  id: string;
  title: string;
  tagline: string;
  description: string;
  /** One or more people who built it. */
  creators: string[];
  techStack: string[];
  /** Up to 3 image URLs / data URLs. */
  screenshots: string[];
  githubUrl?: string;
  demoUrl?: string;
  category?: string;
  /** Account that posted it (null for seeded content). */
  authorId: string | null;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
  baseLikes: number;
  likedBy: string[];
  baseReposts: number;
  repostedBy: string[];
  comments: ProjectComment[];
}

// --- Forms module (Google-Forms-style builder + responses) ----------------

export type FormFieldType =
  | 'short-text'
  | 'long-text'
  | 'email'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'image';

export interface FormFieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  /** Stored as form_fields.help_text. */
  description?: string;
  placeholder?: string;
  required: boolean;
  /** For dropdown / radio / checkbox. */
  options?: FormFieldOption[];
}

export interface FormPage {
  id: string;
  title?: string;
  description?: string;
  fields: FormField[];
}

/**
 * draft = built but never released; open = accepting responses; closed = kept
 * with its data but no longer accepting. The database enforces these three, so
 * the app mirrors them rather than carrying its own vocabulary.
 */
export type FormStatus = 'draft' | 'open' | 'closed';

export interface FormDef {
  id: string;
  title: string;
  description: string;
  pages: FormPage[];
  status: FormStatus;
  createdAt: string;
  updatedAt?: string;
  /** The seeded feedback form is pinned below admin-created forms. */
  isDefault?: boolean;
  /** Before this instant the form is built but not yet accepting responses. */
  opensAt?: string | null;
  /** After this instant the form stops accepting responses. */
  closesAt?: string | null;
  /** null means unlimited. */
  maxResponses?: number | null;
  /** Whether students may see how many seats are left. */
  showRemaining?: boolean;
  createdBy?: string | null;
}

/**
 * Seat availability for a form. The counts come back null when the form hides
 * them from students; isOpen is always trustworthy.
 */
export interface FormCapacity {
  maxResponses: number | null;
  responseCount: number | null;
  remaining: number | null;
  isOpen: boolean;
}

/** A single answer value: text, a choice, multiple choices, or a file marker. */
export type FormAnswer = string | string[];

export interface FormResponse {
  id: string;
  formId: string;
  /** Auth user id, absent for anonymous submissions. */
  submittedBy?: string;
  /** Stamped server-side from the session; never sent by the client. */
  studentEmail?: string | null;
  submittedAt: string;
  /** Keyed by field id. */
  answers: Record<string, FormAnswer>;
  /** Snapshot of field labels at submit time so responses read correctly even if the form is later edited. */
  fieldLabels: Record<string, string>;
}

/**
 * A seat on the society's org chart.
 *
 * Roles live in their own catalogue rather than as an enum on the member, because the
 * council reshuffles mid-term and the number of Joint Secretaries changes every year.
 * `tier` is depth in the tree and `rank` orders siblings within a tier, so adding or
 * renaming a role never means touching rendering code.
 *
 * Deliberately NOT linked to `profiles`: the Faculty Advisor and most Joint Secretaries
 * have no portal login, and promoting a new council must not silently grant or revoke
 * anyone's admin access.
 */
export interface HierarchyRole {
  slug: string;
  title: string;
  tier: number;
  rank: number;
  /** True where several people hold the same title (Joint Secretary). */
  multiple: boolean;
}

export interface HierarchyMember {
  id: string;
  name: string;
  /** Catalogue slug. Falls back to free text for roles created ad hoc. */
  roleSlug: string;
  /** Order among people sharing a role; ignored unless the role allows several. */
  seat?: number;
  photo: string;
  email?: string;
  linkedin?: string;
}

export interface HierarchyTerm {
  /** Session code, e.g. "FA26". Unique. */
  term: string;
  /** Exactly one term is current; promoting a new one demotes the previous. */
  isCurrent: boolean;
  /** Human label for the archive selector, e.g. "Fall 2026". */
  label: string;
  members: HierarchyMember[];
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
}

export interface NavLinkItem {
  id: string;
  label: string;
  to: string;
  /** Whether it currently shows in the public navbar. */
  enabled: boolean;
}

export type FooterColumn = 'Explore' | 'Society' | 'Support';

export interface FooterLinkItem {
  id: string;
  label: string;
  to: string;
  /** Which footer column it lives under. */
  column: FooterColumn;
  /** Whether it currently shows in the footer. */
  enabled: boolean;
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  category:
    | 'University Portals'
    | 'Academic Resources'
    | 'Society Links'
    | 'Forms'
    | 'Event Links'
    | 'Past Paper Links'
    | 'Student Help';
  icon?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category:
    | 'IEEE CS'
    | 'Past Papers'
    | 'Courses'
    | 'Events'
    | 'Navigation'
    | 'Projects Expo'
    | 'Contributions'
    | 'Technical Issues';
}

export interface GalleryImage {
  id: string;
  url: string;
  caption: string;
}

export interface GalleryAlbum {
  id: string;
  title: string;
  date: string;
  coverImage: string;
  description: string;
  images: GalleryImage[];
}

export type SubmissionType =
  | 'paper'
  | 'course-correction'
  | 'project'
  | 'navigation-report'
  | 'event-photos'
  | 'feedback'
  | 'sponsorship'
  | 'teacher-suggestion'
  | 'event-image'
  | 'paper-request'
  | 'course-resource'
  | 'event-registration'
  | 'contact';

export interface Submission {
  id: string;
  type: SubmissionType;
  submittedBy: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  data: Record<string, string>;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'super-admin' | 'editor' | 'moderator';
  lastActive: string;
}

export interface SearchResult {
  id: string;
  title: string;
  type: string;
  description: string;
  tags: string[];
  link: string;
}

/**
 * The only part of a developer's entry an admin may change.
 *
 * Everything else — who is on the list, their name, role, photo and write-up — is fixed in
 * src/data/developers.ts. The database enforces that too: developer_links has no INSERT or
 * DELETE policy for anyone, and a trigger refuses a slug rename, so "cannot add or remove a
 * developer" is a guarantee rather than a convention in the UI.
 */
export interface DeveloperLinks {
  portfolio?: string;
  github?: string;
  linkedin?: string;
  email?: string;
  phone?: string;
}

/** The fixed part of a developer's entry, authored in the repo. */
export interface DeveloperProfile {
  id: string;
  name: string;
  role: string;
  photo: string;
  contribution: string;
  bio: string;
  skills: string[];
}

/** A profile with its editable links merged in, which is what the page renders. */
export interface Developer extends DeveloperProfile {
  links: DeveloperLinks;
}


export type ProfileRole =
  | 'student'
  | 'webmaster'
  | 'vice_chairperson'
  | 'chairperson'
  | 'general_secretary'
  | 'joint_secretary'
  | 'graphic_designer'
  | 'operations_manager'
  | 'treasurer';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: ProfileRole;
  createdAt: string;
}

export const SOCIETY_ROLES = [
  'webmaster',
  'vice_chairperson',
  'chairperson',
  'general_secretary',
  'joint_secretary',
  'graphic_designer',
  'operations_manager',
  'treasurer',
] as const satisfies readonly ProfileRole[];

export const CONTENT_MANAGER_ROLES = [
  'webmaster',
  'vice_chairperson',
  'chairperson',
  'general_secretary',
] as const satisfies readonly ProfileRole[];
