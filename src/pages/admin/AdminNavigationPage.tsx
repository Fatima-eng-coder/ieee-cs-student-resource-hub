import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Lock, MapPinned, ShieldAlert } from 'lucide-react';
import AdminTopbar from '@/components/admin/AdminTopbar';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';

/**
 * A read-only window onto the surveyed building dataset.
 *
 * This page used to edit a localStorage "destinations" collection that nothing else in the app
 * read, listing rooms that do not exist in the building. The real map is
 * src/data/navigation/building.json, surveyed by hand and shared verbatim with the separate 3D
 * navigator project — so it cannot become an editable table here without the two copies
 * silently diverging. What an admin needs from this screen is therefore not an editor but an
 * answer to "what does the map actually contain, and how do I get a mistake in it fixed".
 */

/** Typed off the module rather than its pieces, so the dynamic import below stays erased. */
type NavigationModule = typeof import('@/lib/navigation/data');

interface CategoryCount {
  category: string;
  label: string;
  /** Used when the count is one — the dataset carries both forms. */
  singularLabel: string;
  chip: string;
  count: number;
}

interface FloorSummary {
  id: string;
  label: string;
  badge: string;
  rooms: number;
  /** Rooms, entrances, stairs and lifts a student can search for and route to on this floor. */
  searchable: number;
  stairs: number;
  elevators: number;
  entrances: number;
  nodes: number;
  categories: CategoryCount[];
}

interface DatasetSummary {
  buildingName: string;
  format: string;
  version: number;
  metresPerUnit: number;
  floors: FloorSummary[];
  categories: CategoryCount[];
  totals: {
    floors: number;
    rooms: number;
    places: number;
    entrances: number;
    stairs: number;
    elevators: number;
    nodes: number;
    edges: number;
  };
}

/** "male-washroom" → "Male washrooms". Only used where the dataset's own label is ambiguous. */
function spellOutCategory(category: string): string {
  const words = category.split('-').join(' ');
  const plural = words.endsWith('s') ? words : `${words}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

function summarise(nav: NavigationModule): DatasetSummary {
  const { dataset, floors, placesByFloor, places, categoryMeta, BUILDING_NAME, METRES_PER_UNIT } = nav;

  /**
   * Two surveyed categories can share one display label — male-washroom and female-washroom
   * are both "Washrooms" to CATEGORY_META, which on a summary prints as the same row twice and
   * reads as a bug. Where a label is not unique the category id is spelled out instead.
   *
   * Decided once over the whole building rather than per floor, so a category is never called
   * one thing in the totals and another on the floor it sits on.
   */
  const labelFor = (() => {
    const plurals = new Map<string, string>();
    const shareCount = new Map<string, number>();

    for (const room of dataset.rooms) {
      if (plurals.has(room.category)) continue;
      const plural = categoryMeta(room.category).plural;
      plurals.set(room.category, plural);
      shareCount.set(plural, (shareCount.get(plural) ?? 0) + 1);
    }

    return (category: string) => {
      const plural = plurals.get(category) ?? categoryMeta(category).plural;
      return (shareCount.get(plural) ?? 0) > 1 ? spellOutCategory(category) : plural;
    };
  })();

  const countCategories = (rooms: typeof dataset.rooms): CategoryCount[] => {
    const tally = new Map<string, number>();
    for (const room of rooms) tally.set(room.category, (tally.get(room.category) ?? 0) + 1);

    return [...tally.entries()]
      .map(([category, count]) => ({
        category,
        label: labelFor(category),
        // "1 Canteens" reads as a rendering bug on a page whose whole job is to be trusted
        // about what was surveyed.
        singularLabel: categoryMeta(category).label,
        chip: categoryMeta(category).chip,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    buildingName: BUILDING_NAME,
    format: dataset.format,
    version: dataset.version,
    metresPerUnit: METRES_PER_UNIT,
    categories: countCategories(dataset.rooms),
    floors: floors.map((floor) => ({
      id: floor.id,
      label: floor.label,
      badge: floor.badge,
      rooms: dataset.rooms.filter((room) => room.floorId === floor.id).length,
      searchable: placesByFloor.get(floor.id)?.length ?? 0,
      // A shaft is listed once and serves several floors, so it is counted per floor it reaches
      // rather than per row in the dataset.
      stairs: dataset.stairs.filter((core) => core.floorIds.includes(floor.id)).length,
      elevators: dataset.elevators.filter((core) => core.floorIds.includes(floor.id)).length,
      entrances: dataset.entrances.filter((entrance) => entrance.floorId === floor.id).length,
      nodes: dataset.graph.nodes.filter((node) => node.floorId === floor.id).length,
      categories: countCategories(dataset.rooms.filter((room) => room.floorId === floor.id)),
    })),
    totals: {
      floors: floors.length,
      rooms: dataset.rooms.length,
      places: places.length,
      entrances: dataset.entrances.length,
      stairs: dataset.stairs.length,
      elevators: dataset.elevators.length,
      nodes: dataset.graph.nodes.length,
      // Edges cross floors, so this one is only meaningful as a whole-building figure.
      edges: dataset.graph.edges.length,
    },
  };
}

export default function AdminNavigationPage() {
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loaded on demand, not imported at the top: building.json is 170 KB and this page is
  // reached through an eagerly bundled admin route, so a static import would put the whole
  // survey into the main chunk for every visitor who never opens the map.
  useEffect(() => {
    let cancelled = false;

    import('@/lib/navigation/data')
      .then((nav) => {
        if (!cancelled) setSummary(summarise(nav));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'The building dataset could not be loaded.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const columns: AdminTableColumn<FloorSummary>[] = [
    {
      key: 'label',
      header: 'Floor',
      sortValue: (floor) => floor.label,
      render: (floor) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ieee-orange/10 font-mono text-xs font-bold text-ieee-orange">
            {floor.badge}
          </span>
          <span className="font-medium text-slate-900">{floor.label}</span>
        </div>
      ),
    },
    {
      key: 'rooms',
      header: 'Rooms',
      sortValue: (floor) => floor.rooms,
      render: (floor) => floor.rooms,
    },
    {
      key: 'categories',
      header: 'What is on it',
      render: (floor) => (
        <div className="flex max-w-md flex-wrap gap-1">
          {floor.categories.map((entry) => (
            <span
              key={entry.category}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${entry.chip}`}
            >
              {entry.count} {entry.count === 1 ? entry.singularLabel : entry.label}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'access',
      header: 'Stairs / Lifts',
      sortValue: (floor) => floor.stairs + floor.elevators,
      render: (floor) => (
        <span className="whitespace-nowrap text-slate-600">
          {floor.stairs} / {floor.elevators}
        </span>
      ),
    },
    {
      key: 'entrances',
      header: 'Entrances',
      sortValue: (floor) => floor.entrances,
      render: (floor) => (floor.entrances > 0 ? floor.entrances : <span className="text-slate-300">—</span>),
    },
    {
      key: 'searchable',
      header: 'Searchable places',
      sortValue: (floor) => floor.searchable,
      render: (floor) => floor.searchable,
    },
    {
      key: 'nodes',
      header: 'Route points',
      sortValue: (floor) => floor.nodes,
      render: (floor) => <span className="font-mono text-xs text-slate-500">{floor.nodes}</span>,
    },
  ];

  return (
    <div>
      <AdminTopbar
        title="Navigation Map"
        subtitle="What the surveyed building dataset contains"
        action={
          <Link
            to="/navigation"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            <ExternalLink className="h-4 w-4" /> Open the map
          </Link>
        }
      />

      <div className="p-4 sm:p-6">
        <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(10,10,12,0.06)] sm:flex-row sm:items-start">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Lock className="h-4 w-4" />
          </span>
          <div className="text-sm text-slate-600">
            <p className="font-display text-base font-bold text-slate-900">This map is not edited from here</p>
            <p className="mt-1">
              The building was surveyed by hand and lives in the repository as{' '}
              <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs text-slate-700">
                src/data/navigation/building.json
              </code>
              . The same file is read verbatim by the separate 3D navigator project, so a room added or moved through
              an admin screen would exist in one copy of the map and not the other. Changing it is a code change,
              reviewed and deployed like any other.
            </p>
            <p className="mt-2">
              What this page is for is answering &ldquo;is that room actually on the map?&rdquo; — and pointing at the
              queue where a student&rsquo;s correction arrives.
            </p>
          </div>
        </section>

        <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-ieee-orange/30 bg-ieee-orange/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ieee-orange/15 text-ieee-orange">
              <MapPinned className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-slate-900">Corrections come in through the inbox</p>
              <p className="mt-0.5 text-sm text-slate-600">
                A hand survey is the only thing standing behind these routes, so the reports students send are the
                only way an error in it comes back. Read them, fix the dataset, then mark the report fixed.
              </p>
            </div>
          </div>
          <Link
            to="/portal/inbox"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            Open route reports
          </Link>
        </section>

        {error ? (
          <div className="rounded-2xl border border-black/5 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="font-display text-base font-bold text-slate-700">The dataset could not be read</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {error} The map itself is served from the same file, so it is likely to be failing for visitors too.
            </p>
          </div>
        ) : !summary ? (
          <>
            <div className="h-24 animate-pulse rounded-2xl border border-black/5 bg-white" />
            <div className="mt-4 h-72 animate-pulse rounded-2xl border border-black/5 bg-white" />
          </>
        ) : (
          <>
            <section className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
              <Stat label="Building">{summary.buildingName}</Stat>
              <Stat label="Floors">{summary.totals.floors}</Stat>
              <Stat label="Rooms">{summary.totals.rooms}</Stat>
              <Stat label="Searchable places">{summary.totals.places}</Stat>
              <Stat label="Entrances">{summary.totals.entrances}</Stat>
              <Stat label="Stairs / Lifts">
                {summary.totals.stairs} / {summary.totals.elevators}
              </Stat>
              <Stat label="Route graph">
                <span className="font-mono text-base">
                  {summary.totals.nodes}
                  <span className="text-slate-400"> pts · </span>
                  {summary.totals.edges}
                  <span className="text-slate-400"> links</span>
                </span>
              </Stat>
            </section>

            <div className="mb-3">
              <h2 className="font-display text-base font-bold text-slate-900">Floor by floor</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Everything the survey recorded. A stair or lift is counted on each floor it reaches, not once per
                shaft, and &ldquo;route points&rdquo; are the graph nodes a direction is calculated across.
              </p>
            </div>

            <AdminTable
              columns={columns}
              rows={summary.floors}
              rowKey={(floor) => floor.id}
              emptyTitle="The dataset lists no floors"
              emptyMessage="The building file was read but describes no floors, which means the map cannot draw anything."
            />

            <section className="mt-4 rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(10,10,12,0.06)]">
              <h2 className="font-display text-base font-bold text-slate-900">Rooms by kind</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Across the whole building. &ldquo;Other rooms&rdquo; are ones the survey found but recorded no use
                for — those are the ones a student report is most likely to be about.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {summary.categories.map((entry) => (
                  <span
                    key={entry.category}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${entry.chip}`}
                  >
                    {entry.count} {entry.label}
                  </span>
                ))}
              </div>
            </section>

            <p className="mt-4 text-xs text-slate-400">
              Dataset format <span className="font-mono">{summary.format}</span> version{' '}
              <span className="font-mono">{summary.version}</span> · 1 unit ={' '}
              <span className="font-mono">{summary.metresPerUnit}</span> m
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 font-display text-lg font-bold text-slate-900">{children}</div>
    </div>
  );
}
