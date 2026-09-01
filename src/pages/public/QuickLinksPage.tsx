import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Building2,
  BookOpen,
  Users2,
  FileText,
  CalendarDays,
  LifeBuoy,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { quickLinksService } from '@/services/siteContentService';
import type { QuickLink } from '@/types';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import EmptyState from '@/components/ui/EmptyState';

const categoryMeta: Record<QuickLink['category'], { icon: LucideIcon }> = {
  'University Portals': { icon: Building2 },
  'Academic Resources': { icon: BookOpen },
  'Society Links': { icon: Users2 },
  Forms: { icon: ClipboardList },
  'Event Links': { icon: CalendarDays },
  'Past Paper Links': { icon: FileText },
  'Student Help': { icon: LifeBuoy },
};

const categories = Object.keys(categoryMeta) as QuickLink['category'][];

export default function QuickLinksPage() {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    quickLinksService
      .list()
      .then((items) => {
        if (!ignore) setQuickLinks(items);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load the links.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="Jump To"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Quick Links' }]}
        title="Quick Links"
        subtitle="Every important link for CS students, organized by category — portals, resources, society channels and forms, all in one place."
        meta={[{ value: loading ? '—' : `${quickLinks.length}`, label: 'Curated Links' }]}
      />

      <PageSection tone="cream" top>
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-3xl border border-black/5 bg-white" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title="Links unavailable" description={error} />
        ) : quickLinks.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No links yet"
            description="The team has not published any quick links — check back soon."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {categories.map((cat) => {
              const links = quickLinks.filter((l) => l.category === cat);
              if (links.length === 0) return null;
              const Icon = categoryMeta[cat].icon;
              return (
                <motion.div
                  key={cat}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5 }}
                  className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ieee-orange/10 text-ieee-orange">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <h2 className="font-display font-bold text-slate-900">{cat}</h2>
                  </div>
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {links.map((link) => {
                      const external = link.url.startsWith('http');
                      const content = (
                        <>
                          <span>{link.label}</span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-orange" />
                        </>
                      );
                      const className =
                        'group flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-cream hover:text-ieee-orange';
                      return (
                        <li key={link.id}>
                          {external ? (
                            <a href={link.url} target="_blank" rel="noreferrer" data-cursor="link" className={className}>
                              {content}
                            </a>
                          ) : (
                            <Link to={link.url} data-cursor="link" className={className}>
                              {content}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        )}
      </PageSection>
    </div>
  );
}
