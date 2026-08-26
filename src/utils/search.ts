import type {
  SearchResult,
  Paper,
  Course,
  EventItem,
  FAQ,
  Destination,
  QuickLink,
  ProjectPost,
  DateSheet,
} from '@/types';
import { readCollection } from '@/services/store';
import { papers as papersSeed } from '@/data/papers';
import { courses as coursesSeed } from '@/data/courses';
import { events as eventsSeed } from '@/data/events';
import { faqs as faqsSeed } from '@/data/faqs';
import { destinations as destinationsSeed } from '@/data/destinations';
import { quickLinks as quickLinksSeed } from '@/data/quickLinks';
import { projectSeed } from '@/data/projectSeed';
import { dateSheets as dateSheetsSeed } from '@/data/dateSheets';
import { teachers } from '@/data/teachers';

/** Normalize away spaces/punctuation so "CS 301" matches "CS-301". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Built fresh per search so results always reflect the live collections. */
function buildIndex(): SearchResult[] {
  const results: SearchResult[] = [];

  readCollection<Paper>('papers', papersSeed)
    .filter((p) => p.verification === 'verified')
    .forEach((p) =>
      results.push({
        id: p.id,
        title: p.title,
        type: 'Past Paper',
        description: `${p.courseName} — ${p.term} ${p.year} ${p.examType}`,
        tags: p.tags,
        link: `/past-papers/${p.id}`,
      })
    );

  readCollection<Course>('courses', coursesSeed).forEach((c) =>
    results.push({
      id: c.id,
      title: `${c.code} — ${c.name}`,
      type: 'Course',
      description: c.description,
      tags: [c.code, c.department, c.semester ? `Semester ${c.semester}` : ''].filter(Boolean),
      link: `/courses/${c.id}`,
    })
  );

  readCollection<EventItem>('events', eventsSeed).forEach((e) =>
    results.push({
      id: e.id,
      title: e.title,
      type: 'Event',
      description: e.description,
      tags: [e.category, e.timing],
      link: `/events/${e.id}`,
    })
  );

  readCollection<ProjectPost>('projectPosts', projectSeed).forEach((p) =>
    results.push({
      id: p.id,
      title: p.title,
      type: 'Project',
      description: p.tagline,
      tags: p.techStack,
      link: `/projects-expo/${p.id}`,
    })
  );

  readCollection<DateSheet>('dateSheets', dateSheetsSeed).forEach((d) =>
    results.push({
      id: d.id,
      title: d.title,
      type: 'Date Sheet',
      description: `${d.program} · Semester ${d.semester}`,
      tags: [d.program, `Semester ${d.semester}`],
      link: `/date-sheets`,
    })
  );

  readCollection<FAQ>('faqs', faqsSeed).forEach((f) =>
    results.push({ id: f.id, title: f.question, type: 'FAQ', description: f.answer, tags: [f.category], link: `/faq-contact` })
  );

  readCollection<Destination>('destinations', destinationsSeed).forEach((d) =>
    results.push({
      id: d.id,
      title: d.name,
      type: 'Room / Lab',
      description: `${d.floor} — ${d.description}`,
      tags: [d.floor],
      link: `/navigation`,
    })
  );

  teachers.forEach((t) =>
    results.push({
      id: t.id,
      title: t.name,
      type: 'Teacher',
      description: `${t.designation}, ${t.department}`,
      tags: [t.department],
      link: `/courses/teachers`,
    })
  );

  readCollection<QuickLink>('quickLinks', quickLinksSeed).forEach((q) =>
    results.push({
      id: q.id,
      title: q.label,
      type: 'Quick Link',
      description: q.category,
      tags: [q.category],
      link: q.url.startsWith('/') ? q.url : '/quick-links',
    })
  );

  return results;
}

export function search(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const nq = norm(q);
  return buildIndex().filter((item) => {
    const hay = `${item.title} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
    return hay.includes(q) || (nq.length >= 2 && norm(hay).includes(nq));
  });
}
