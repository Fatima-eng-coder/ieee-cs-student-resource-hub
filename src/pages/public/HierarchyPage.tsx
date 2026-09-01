import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import SectionHeading from '@/components/layout/SectionHeading';
import EmptyState from '@/components/ui/EmptyState';
import { PLACEHOLDER_PHOTO } from '@/data/hierarchy';
import {
  UNFILED_TIER,
  hierarchyService,
  indexRoles,
  sortMembers,
  titleForRole,
  type HierarchyMemberRecord,
  type HierarchyTermRecord,
} from '@/services/hierarchyService';
import type { HierarchyRole } from '@/types';

/**
 * Groups a roster into org-chart rows.
 *
 * The shape of the chart comes entirely from the role catalogue's `tier`/`rank`, never from
 * the member order — so adding a role, renaming one, or running seven Joint Secretaries
 * instead of three needs no change here. The catalogue is the one in the database, not the
 * static list in src/data/hierarchy.ts: an admin can change the former and only the former.
 * Roles missing from it land in a final row rather than disappearing, which keeps an ad-hoc
 * role visible until someone files it.
 */
function buildTiers(members: HierarchyMemberRecord[], roleIndex: Map<string, HierarchyRole>) {
  const rows = new Map<number, HierarchyMemberRecord[]>();

  for (const member of sortMembers(members, roleIndex)) {
    const tier = roleIndex.get(member.roleSlug)?.tier ?? UNFILED_TIER;
    rows.set(tier, [...(rows.get(tier) ?? []), member]);
  }

  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, people]) => ({ tier, people }));
}

function MemberCard({
  member,
  roleIndex,
  prominence,
}: {
  member: HierarchyMemberRecord;
  roleIndex: Map<string, HierarchyRole>;
  prominence: 'lead' | 'exec' | 'core';
}) {
  const ring =
    prominence === 'lead' ? 'ring-ieee-orange' : prominence === 'exec' ? 'ring-ieee-orange/45' : 'ring-white';
  const size = prominence === 'lead' ? 'h-14 w-14' : prominence === 'exec' ? 'h-12 w-12' : 'h-11 w-11';

  return (
    <div className="flex min-w-[10.5rem] items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <img
        src={member.photo || PLACEHOLDER_PHOTO}
        alt=""
        loading="lazy"
        className={`${size} shrink-0 rounded-full bg-cream object-cover ring-2 ${ring}`}
      />
      <div className="min-w-0">
        <p className="truncate text-sm leading-tight font-semibold text-slate-900">{member.name}</p>
        <p className="mt-0.5 font-mono text-[10px] tracking-wide text-ieee-orange uppercase">
          {titleForRole(roleIndex, member.roleSlug)}
        </p>
      </div>
    </div>
  );
}

/** The stem joining one tier to the next. Purely decorative. */
function Connector() {
  return <div className="h-7 w-px bg-gradient-to-b from-ieee-orange/50 to-slate-300" aria-hidden="true" />;
}

export default function HierarchyPage() {
  const [roles, setRoles] = useState<HierarchyRole[]>([]);
  const [terms, setTerms] = useState<HierarchyTermRecord[]>([]);
  const [current, setCurrent] = useState<HierarchyTermRecord | null>(null);
  const [currentMembers, setCurrentMembers] = useState<HierarchyMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTermId, setSelectedTermId] = useState('');
  const [archiveMembers, setArchiveMembers] = useState<HierarchyMemberRecord[]>([]);
  /**
   * Kept apart from `error`, which decides whether the page renders at all. One failed archive
   * lookup must not replace a council that has already loaded and is on screen with the
   * "unavailable" hero — the visitor would lose the roster they came for over a term they
   * merely clicked on, with no way back but a reload.
   */
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const roleIndex = useMemo(() => indexRoles(roles), [roles]);

  useEffect(() => {
    let ignore = false;

    Promise.all([hierarchyService.loadCurrentCouncil(), hierarchyService.listTerms()])
      .then(([council, allTerms]) => {
        if (ignore) return;
        setRoles(council.roles);
        setCurrent(council.term);
        setCurrentMembers(council.members);
        setTerms(allTerms);
        setSelectedTermId(council.term?.id ?? allTerms[0]?.id ?? '');
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load the council.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // The archive selector reaches terms the first load never fetched, so each pick is its own
  // read. Selecting the serving term costs nothing: its roster is already here.
  useEffect(() => {
    if (!selectedTermId || selectedTermId === current?.id) {
      setArchiveMembers([]);
      setArchiveError(null);
      return;
    }

    let ignore = false;
    setArchiveError(null);
    hierarchyService
      .listMembers(selectedTermId)
      .then((rows) => {
        if (!ignore) setArchiveMembers(rows);
      })
      .catch((err) => {
        if (ignore) return;
        setArchiveMembers([]);
        setArchiveError(err instanceof Error ? err.message : 'Failed to load that council.');
      });

    return () => {
      ignore = true;
    };
  }, [selectedTermId, current?.id]);

  const tiers = useMemo(() => buildTiers(currentMembers, roleIndex), [currentMembers, roleIndex]);
  const shownMembers = useMemo(
    () => sortMembers(selectedTermId === current?.id ? currentMembers : archiveMembers, roleIndex),
    [selectedTermId, current?.id, currentMembers, archiveMembers, roleIndex]
  );

  // Loading, a failed read and an unpublished council are three different things and the hero
  // says which one it is, rather than showing an empty chart that looks like a finished page.
  if (loading || error || !current) {
    const subtitle = loading
      ? 'Loading the council roster.'
      : error
        ? 'The council roster could not be loaded right now.'
        : 'The council roster has not been published yet. Check back shortly.';

    return (
      <div className="relative">
        <PageHero
          eyebrow="Leadership"
          breadcrumb={[{ label: 'Home', to: '/' }, { label: 'About', to: '/about' }, { label: 'Hierarchy' }]}
          title="Leadership Hierarchy"
          subtitle={subtitle}
        />
        <PageSection tone="cream" top>
          {loading ? (
            <EmptyState title="Loading the hierarchy" description="Fetching the council from the society database." />
          ) : error ? (
            <EmptyState title="Hierarchy unavailable" description={error} />
          ) : (
            <EmptyState title="No council published yet" description="The roster will appear here once the team publishes it." />
          )}
        </PageSection>
      </div>
    );
  }

  return (
    <div className="relative">
      <PageHero
        eyebrow="Leadership"
        breadcrumb={[{ label: 'Home', to: '/' }, { label: 'About', to: '/about' }, { label: 'Hierarchy' }]}
        title="Leadership Hierarchy"
        subtitle="The students who lead the IEEE CS Islamabad Branch each semester — and everyone who came before them."
        meta={[
          { value: String(currentMembers.length), label: `Members · ${current.term}` },
          { value: String(terms.length), label: terms.length === 1 ? 'Council' : 'Councils' },
        ]}
      />

      {/* ---- Org tree ------------------------------------------------ */}
      <PageSection tone="cream" top>
        <SectionHeading
          align="center"
          flourish
          eyebrow={`Organizational Structure · ${current.label}`}
          title="How the council is organized."
        />

        {currentMembers.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-500">
            This council's roster is still being filled in.
          </p>
        ) : (
          <div className="mt-12 flex flex-col items-center">
            {tiers.map(({ tier, people }, index) => (
              <div key={tier} className="flex flex-col items-center">
                {index > 0 && <Connector />}
                <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                  {people.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      roleIndex={roleIndex}
                      prominence={index === 0 ? 'lead' : index < 3 ? 'exec' : 'core'}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* ---- Archive ------------------------------------------------- */}
      {terms.length > 1 && (
        <PageSection tone="white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <SectionHeading eyebrow="Council Archive" title="Every term, remembered." />
            <div className="flex flex-wrap gap-2">
              {terms.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => setSelectedTermId(term.id)}
                  data-cursor="link"
                  aria-pressed={selectedTermId === term.id}
                  className={`rounded-full px-4 py-1.5 font-mono text-xs font-semibold tracking-wide uppercase transition ${
                    selectedTermId === term.id
                      ? 'bg-ieee-orange text-white shadow-[0_6px_20px_rgba(255,108,12,0.3)]'
                      : 'border border-black/10 bg-white text-slate-600 hover:border-ieee-orange/50 hover:text-ieee-orange'
                  }`}
                >
                  {term.term}
                  {term.isCurrent && <span className="ml-1.5 text-[9px] opacity-70">now</span>}
                </button>
              ))}
            </div>
          </div>

          {archiveError && (
            <p className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
              {archiveError}
            </p>
          )}

          {/* Keyed on the term so the new roster animates in; no exit transition to stall on. */}
          <motion.div
            key={selectedTermId}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
          >
            {shownMembers.map((member) => (
              <div
                key={member.id}
                className="group flex flex-col items-center rounded-2xl border border-black/5 bg-cream p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <img
                  src={member.photo || PLACEHOLDER_PHOTO}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 rounded-full bg-white object-cover ring-2 ring-white transition-transform duration-300 group-hover:scale-105"
                />
                <p className="mt-3 text-sm font-semibold text-slate-900">{member.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tracking-wide text-ieee-orange uppercase">
                  {titleForRole(roleIndex, member.roleSlug)}
                </p>
              </div>
            ))}
          </motion.div>
        </PageSection>
      )}
    </div>
  );
}
