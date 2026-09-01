/**
 * The student project showcase, backed by public.projects.
 *
 * Moderated by design: the INSERT policy pins status = 'pending' and author_id = auth.uid(),
 * so a student can neither publish straight onto the public page nor post as somebody else.
 * Only a content manager can move a row to 'approved', and only 'approved' rows are readable
 * by visitors — a student may read back their own submission while it waits, which is what
 * gives "did it arrive?" an answer that is not "ask an admin".
 *
 * The public page is parked behind a coming-soon screen today. That is a rendering decision,
 * not a storage one: everything submitted from now on is stored, so turning the page on later
 * is a change of screen rather than a discovery that nothing was kept.
 */

import { supabase } from '@/lib/supabase';
import type { ProjectPost, User } from '@/types';

/**
 * Screenshots share the events bucket rather than getting one of their own, because creating a
 * bucket is a dashboard action no migration in this repo can perform.
 *
 * The prefix is `submissions/<uid>/projects/<projectId>/`, not a flat `projects/`. That is
 * forced by the bucket's policies, not by taste. storage.objects carries exactly two families
 * of INSERT policy for this bucket: the content-manager ones (bucket-wide, made in the
 * dashboard, gated on private.can_manage_content()), and the student ones from
 * 20260901000700, which check that the first two path segments are `submissions` and the
 * caller's own uid. A student submitting a project is not a content manager, so a write to a
 * projects/<uid>/<projectId>/… in the event-images bucket. 20260901002100 grants a signed-in
 * student INSERT there and 20260901002600 deliberately withholds DELETE: an author whose project
 * has been approved must not be able to empty the folder the public showcase is rendering from.
 *
 * The earlier draft borrowed the student photo folder (submissions/<uid>/…) because a bare
 * `projects/` prefix was refused at the time. It was refused because the policy did not exist
 * yet, and borrowing carried that folder's DELETE policy with it — which is exactly the control
 * an author should not have here.
 *
 * The cost of insert-only is an orphaned file when an upload lands and the row insert then
 * fails. Cleaning that up is a content manager's job, and a few invisible kilobytes are a better
 * outcome than three broken images on a public page.
 */
const PROJECT_BUCKET = 'event-images';
const projectFolder = (authorId: string, projectId: string) =>
  `projects/${authorId}/${projectId}`;

/** projects_screenshot_count_check. Stated here so the picker and the database agree. */
export const MAX_PROJECT_SCREENSHOTS = 3;

const projectColumns =
  'id,title,tagline,description,creators,tech_stack,screenshots,image_paths,github_url,demo_url,category,status,author_name,author_id,reviewed_by,reviewed_at,created_at,updated_at';

/** Mirrors projects_status_check. */
export type ProjectStatus = 'pending' | 'approved' | 'rejected';

/** The two ends of a review. A row never travels back to 'pending' once someone has judged it. */
export type ProjectDecision = Exclude<ProjectStatus, 'pending'>;

export interface Project {
  id: string;
  title: string;
  tagline: string;
  description: string;
  creators: string[];
  techStack: string[];
  /** Public URLs, at most MAX_PROJECT_SCREENSHOTS of them. */
  screenshots: string[];
  /** Bucket paths, one per screenshot — the pairing the delete path sweeps on. */
  imagePaths: string[];
  githubUrl: string | null;
  demoUrl: string | null;
  category: string | null;
  status: ProjectStatus;
  authorName: string;
  authorId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the submit form collects. Screenshots are files here; they become URLs on the way in. */
export interface ProjectSubmission {
  title: string;
  tagline: string;
  description: string;
  creators: string[];
  techStack: string[];
  category: string;
  githubUrl: string;
  demoUrl: string;
  authorName: string;
  screenshots: File[];
}

interface ProjectRow {
  id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  creators: unknown;
  tech_stack: unknown;
  screenshots: unknown;
  image_paths: unknown;
  github_url: string | null;
  demo_url: string | null;
  category: string | null;
  status: string;
  author_name: string | null;
  author_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UploadedImage {
  url: string;
  path: string;
}

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalizeStatus = (value: string): ProjectStatus =>
  value === 'approved' || value === 'rejected' ? value : 'pending';

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  title: row.title,
  tagline: row.tagline ?? '',
  description: row.description ?? '',
  creators: toStringArray(row.creators),
  techStack: toStringArray(row.tech_stack),
  screenshots: toStringArray(row.screenshots),
  imagePaths: toStringArray(row.image_paths),
  githubUrl: row.github_url,
  demoUrl: row.demo_url,
  category: row.category,
  status: normalizeStatus(row.status),
  authorName: row.author_name ?? '',
  authorId: row.author_id,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * screenshots and image_paths are one value as far as projects_image_paths_check is concerned:
 * it refuses any row whose two lists differ in length, because a screenshot with no recorded
 * path can never be swept out of the bucket once the row is gone. They are written from the
 * same array here so they cannot drift apart.
 *
 * status and author_id are deliberately absent: both are pinned by the caller that knows them,
 * and the INSERT policy checks them. There is no student_email column here at all — the table
 * publishes approved rows and RLS filters rows rather than columns, so the submitter's address
 * lives in private.contribution_claims, out of the API's reach (20260901002500).
 */
const toPayload = (input: ProjectSubmission, images: UploadedImage[]) => ({
  title: input.title.trim(),
  tagline: input.tagline.trim(),
  description: input.description.trim(),
  creators: input.creators.map((creator) => creator.trim()).filter(Boolean),
  tech_stack: input.techStack.map((tech) => tech.trim()).filter(Boolean),
  screenshots: images.map((image) => image.url),
  image_paths: images.map((image) => image.path),
  github_url: input.githubUrl.trim() || null,
  demo_url: input.demoUrl.trim() || null,
  category: input.category.trim() || null,
  author_name: input.authorName.trim(),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A link to a localStorage-era id (`proj-1`) is not a uuid, and Postgres answers that with a
 * cast error (22P02). A bookmark from before this move deserves "not found" rather than a page
 * telling the visitor the showcase is broken.
 */
const isProjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && UUID_PATTERN.test(id);

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Everything the database would refuse, named in the student's own words first. */
function assertSubmission(input: ProjectSubmission): void {
  if (!input.title.trim()) throw new Error('Please enter the project title.');
  if (!input.tagline.trim()) throw new Error('Please enter a one-line summary of the project.');
  if (!input.description.trim()) throw new Error('Please describe what the project does.');
  if (input.creators.filter((creator) => creator.trim()).length === 0) {
    throw new Error('Please name at least one person who built it.');
  }
  if (input.screenshots.length > MAX_PROJECT_SCREENSHOTS) {
    throw new Error(`You can attach at most ${MAX_PROJECT_SCREENSHOTS} screenshots.`);
  }

  for (const file of input.screenshots) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`"${file.name}" is larger than 5 MB. Please pick a smaller version.`);
    }
  }
}

const friendlyReadError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The project showcase could not be loaded because access to it is currently restricted.';
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'The project showcase is not ready yet. Please check the projects table and Data API settings.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The project showcase could not be loaded right now. Please try again later.';
};

/** Said whenever a write names a row the database no longer hands back, however that is found. */
const STALE_ROW_MESSAGE =
  'That project is no longer there. Reload the list to see what is stored.';

/**
 * The two callers a write can come from. Every constraint reads the same to both, but a refusal
 * does not: a student needs to hear why their submission bounced, a reviewer needs to hear that
 * their role no longer carries the decision. One message covering both would be true and useless.
 */
type WriteIntent = 'submit' | 'manage';

const refusalMessage: Record<WriteIntent, string> = {
  submit:
    'Your project could not be submitted. A project can only be posted from the account that built it, and it is always submitted for review rather than published directly.',
  manage: 'Only content managers can review or remove projects.',
};

const friendlyWriteError = (message: string, intent: WriteIntent) => {
  const lower = message.toLowerCase();

  if (lower.includes('projects_title_check')) {
    return 'Please enter the project title.';
  }
  if (lower.includes('projects_screenshot_count_check')) {
    return `You can attach at most ${MAX_PROJECT_SCREENSHOTS} screenshots.`;
  }
  if (lower.includes('projects_image_paths_check')) {
    return 'Every screenshot has to carry the file it was uploaded to. Please re-add the screenshots and try again.';
  }
  if (lower.includes('projects_status_check')) {
    return 'A project can only be left pending, approved or rejected.';
  }
  if (
    lower.includes('projects_creators_array_check') ||
    lower.includes('projects_tech_array_check') ||
    lower.includes('projects_screenshots_array_check')
  ) {
    return 'The creators, tech stack and screenshots each have to be a list. Please re-enter them and try again.';
  }
  if (lower.includes('projects_pkey') || lower.includes('duplicate key')) {
    return 'A project with that reference already exists. Please try submitting again.';
  }
  if (lower.includes('projects_author_id_fkey') || lower.includes('projects_reviewed_by_fkey')) {
    return 'That account no longer exists, so the project could not be attributed to it.';
  }
  // Covers both shapes of refusal: no grant at all (the request never reaches a policy, and
  // Postgres says "permission denied for table"), and a row a policy declined.
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return refusalMessage[intent];
  }
  if (lower.includes('multiple (or no) rows') || lower.includes('0 rows')) {
    return STALE_ROW_MESSAGE;
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  return 'The project could not be saved right now. Please try again.';
};

const friendlyStorageError = (message: string) => {
  const lower = message.toLowerCase();

  if (
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('unauthorized')
  ) {
    return 'Your screenshots could not be uploaded. Please sign in again and retry — uploads are tied to your own account folder.';
  }
  if (lower.includes('exceeded') || lower.includes('too large') || lower.includes('payload')) {
    return 'That screenshot is too large to upload. Please pick a smaller version.';
  }
  if (lower.includes('already exists') || lower.includes('duplicate')) {
    return 'That screenshot has already been uploaded. Please try again.';
  }
  return 'Those screenshots could not be uploaded right now. Please try again.';
};

async function refreshAuthSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.warn('Could not refresh auth session before protected action', error);
}

/**
 * Best effort by design. Every caller has already done, or is about to do, the thing that
 * actually matters; a bucket that refused the removal must not turn a completed delete into an
 * error. An orphaned file costs storage, a half-reported delete costs trust in the screen.
 */
async function sweepStorage(paths: string[]): Promise<void> {
  const present = paths.filter(Boolean);
  if (present.length === 0) return;

  const { error } = await supabase.storage.from(PROJECT_BUCKET).remove(present);
  if (error) console.warn('Project screenshots could not be removed from storage', error);
}

/** Index-suffixed so two files chosen in the same millisecond cannot collide. */
function safeFileName(file: File, index: number): string {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${Date.now()}-${index}-${base || 'screenshot'}.${extension}`;
}

export function subscribeProjectsChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let timeout: number | null = null;
  const realtimeChannel = supabase.channel(`projects-sync-${crypto.randomUUID()}`);
  const scheduleCallback = () => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(callback, 150);
  };

  realtimeChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, scheduleCallback)
    .subscribe();

  return () => {
    if (timeout) window.clearTimeout(timeout);
    void supabase.removeChannel(realtimeChannel);
  };
}

export const projectsService = {
  /**
   * What the public showcase renders. The status filter is stated here as well as enforced by
   * the read policy: a content manager browsing the public page must see the same page a
   * visitor sees, and their own broader policy would otherwise hand them the pending queue.
   */
  async listApproved(): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select(projectColumns)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toProject(row as ProjectRow));
  },

  async getApproved(id?: string): Promise<Project | null> {
    if (!isProjectId(id)) return null;

    const { data, error } = await supabase
      .from('projects')
      .select(projectColumns)
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle();

    if (error) throw new Error(friendlyReadError(error.message));
    return data ? toProject(data as ProjectRow) : null;
  },

  /**
   * A student's own submissions, pending ones included — the whole point of the "Students can
   * read their own projects" policy. Signed out there is no author to match, and that is an
   * absence rather than a failed read, so it is the one place here that answers with a list
   * instead of throwing.
   */
  async listMine(): Promise<Project[]> {
    const { data: userData } = await supabase.auth.getUser();
    const authorId = userData.user?.id;
    if (!authorId) return [];

    const { data, error } = await supabase
      .from('projects')
      .select(projectColumns)
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyReadError(error.message));
    return (data ?? []).map((row) => toProject(row as ProjectRow));
  },

  /**
   * The moderation queue: everything the caller's policies let them see, waiting work first.
   *
   * That order is not something the query can ask for. `status` sorts alphabetically —
   * approved, pending, rejected — and PostgREST has no expression ordering, so the one
   * precedence that matters to a reviewer is applied here, over a stable newest-first read.
   *
   * For anyone who is not a content manager this comes back as their own submissions alone,
   * which is the read policy working, not a fault. The page says so rather than showing an
   * empty queue as though nothing had been submitted.
   */
  async listForReview(): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select(projectColumns)
      .order('created_at', { ascending: false });

    if (error) throw new Error(friendlyReadError(error.message));

    return (data ?? [])
      .map((row) => toProject(row as ProjectRow))
      .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  },

  /**
   * Uploads first, then inserts, because projects_image_paths_check will not accept a row whose
   * screenshots have no paths — there is no valid row to write until the files exist. Anything
   * that fails after an upload sweeps its own files back out before it rethrows, so a rejected
   * submission does not leave three orphans in the bucket.
   *
   * The id is generated here rather than left to the column default so the screenshots can be
   * filed under it. A collision comes back as projects_pkey and is reported as such.
   */
  async submit(input: ProjectSubmission): Promise<Project> {
    assertSubmission(input);

    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();
    const author = userData.user;
    if (!author) {
      throw new Error('Please sign in before submitting a project — a submission is credited to your account.');
    }

    const projectId = crypto.randomUUID();
    const folder = projectFolder(author.id, projectId);
    const uploaded: UploadedImage[] = [];

    try {
      for (const [index, file] of input.screenshots.entries()) {
        const path = `${folder}/${safeFileName(file, index)}`;
        const { error } = await supabase.storage
          .from(PROJECT_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) throw new Error(friendlyStorageError(error.message));

        const { data } = supabase.storage.from(PROJECT_BUCKET).getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, path });
      }

      // status and author_id are what the INSERT policy checks; sending them explicitly means a
      // refusal here is a real permission problem rather than a column this code forgot.
      const { data, error } = await supabase
        .from('projects')
        .insert({
          id: projectId,
          ...toPayload(input, uploaded),
          status: 'pending',
          author_id: author.id,
        })
        .select(projectColumns)
        .single();

      if (error) throw new Error(friendlyWriteError(error.message, 'submit'));
      return toProject(data as ProjectRow);
    } catch (cause) {
      await sweepStorage(uploaded.map((image) => image.path));
      throw cause;
    }
  },

  /**
   * Approve or reject. reviewed_by and reviewed_at move with the status so the queue records
   * who decided and when, rather than only what was decided.
   *
   * A row the policy declines to update is filtered out rather than raising, so the update
   * matches nothing and comes back without an error at all — maybeSingle plus the null check is
   * what separates a stored decision from one the database quietly refused.
   */
  async review(id: string, status: ProjectDecision): Promise<Project> {
    await refreshAuthSession();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('projects')
      .update({
        status,
        reviewed_by: userData.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(projectColumns)
      .maybeSingle();

    if (error) throw new Error(friendlyWriteError(error.message, 'manage'));
    if (!data) throw new Error(STALE_ROW_MESSAGE);
    return toProject(data as ProjectRow);
  },

  /**
   * The row goes first and the files after it, never the other way round: a sweep that ran
   * before a delete the policy then refused would leave the project on the public page with
   * every screenshot 404ing, and the files gone for good.
   *
   * The count is load-bearing for the same reason as galleryService.remove — Postgres applies
   * an RLS USING clause to DELETE by filtering rows, so a caller the policy declines removes
   * zero rows and PostgREST answers 204 with no error. That is reachable without anyone doing
   * anything strange: canManageContent() reads a profile cached at login, so an admin demoted
   * mid-session still passes the client gate while the database says no. A null count is the
   * header being absent and proves nothing, so only an explicit zero is a refusal.
   */
  async remove(id: string): Promise<void> {
    await refreshAuthSession();

    const { data: row, error: pathError } = await supabase
      .from('projects')
      .select('image_paths')
      .eq('id', id)
      .maybeSingle();

    // Without this a refused read looks exactly like a project that never had screenshots, and
    // the files stay in the bucket with nothing left recording that they were meant to go.
    if (pathError) console.warn('Project screenshot paths could not be read before delete', pathError);

    const { error, count } = await supabase.from('projects').delete({ count: 'exact' }).eq('id', id);

    if (error) throw new Error(friendlyWriteError(error.message, 'manage'));
    if (count === 0) throw new Error(STALE_ROW_MESSAGE);

    await sweepStorage(toStringArray((row as { image_paths: unknown } | null)?.image_paths));
  },

  /**
   * Deprecated, and inert. See the note on commentCount below.
   */
  async addComment(_id: string, _author: User, _body: string): Promise<ProjectPost> {
    throw new Error('Project comments are not stored anywhere, so a comment cannot be posted.');
  },
};

/**
 * Deprecated. Likes, reposts and comments were never stored anywhere but this browser's own
 * localStorage, and public.projects has no columns for any of them. A like count that resets
 * when the page reloads is a bug wearing a feature's clothes, and a comment box that quietly
 * drops what a student wrote is worse, so both are gone from the domain type and from every
 * page that used to render them rather than being kept as decoration.
 *
 * This function and projectsService.addComment above survive only so that
 * src/components/projects/CommentSection.tsx, which imports both, still compiles. Nothing
 * renders that component any more; it and src/components/projects/LikeButton.tsx are now dead
 * code, and these two exports go the moment those files do.
 */
export const commentCount = (post: ProjectPost): number => post.comments.length;
