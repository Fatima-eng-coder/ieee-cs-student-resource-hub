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
  posterUrl?: string | null;
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

export type EventCategory = 'workshop' | 'competition' | 'seminar' | 'hackathon';
export type EventTiming = 'upcoming' | 'previous' | 'featured';

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
  registrationOpen: boolean;
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
  term: string;
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

export interface WeeklyTopic {
  week: number;
  topic: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  /** Recommended semester (1-8). */
  semester?: number;
  department: string;
  description: string;
  outcomes: string[];
  syllabus: WeeklyTopic[];
  cdfUrl?: string;
  labManualUrl?: string;
  teacherIds: string[];
  /** Course codes this course requires beforehand. */
  prerequisites?: string[];
  usefulLinks: { label: string; url: string }[];
  tips: string[];
  verification: VerificationStatus;
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

export interface FormDef {
  id: string;
  title: string;
  description: string;
  pages: FormPage[];
  /** open = visible to students; disabled = hidden but kept with its data. */
  status: 'open' | 'disabled';
  createdAt: string;
  /** The seeded feedback form is pinned below admin-created forms. */
  isDefault?: boolean;
}

/** A single answer value: text, a choice, multiple choices, or a file marker. */
export type FormAnswer = string | string[];

export interface FormResponse {
  id: string;
  formId: string;
  submittedBy?: string;
  submittedAt: string;
  /** Keyed by field id. */
  answers: Record<string, FormAnswer>;
  /** Snapshot of field labels at submit time so responses read correctly even if the form is later edited. */
  fieldLabels: Record<string, string>;
}

export interface HierarchyMember {
  id: string;
  name: string;
  role: string;
  photo: string;
  email?: string;
  linkedin?: string;
}

export interface HierarchyTerm {
  term: string;
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
  | 'paper-request'
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

export interface DeveloperLinks {
  portfolio?: string;
  github?: string;
  linkedin?: string;
  email?: string;
}

export interface Developer {
  id: string;
  name: string;
  role: string;
  photo: string;
  contribution: string;
  bio: string;
  skills: string[];
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
