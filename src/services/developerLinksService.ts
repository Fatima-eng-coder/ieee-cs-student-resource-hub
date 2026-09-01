/**
 * Contact links for the people on the developers page.
 *
 * Only the links live in the database. Who is on the list, and everything descriptive about
 * them, is authored in src/data/developers.ts — see the note there for why.
 *
 * There is deliberately no create or remove here, and that is not just a client-side choice:
 * public.developer_links has SELECT and UPDATE policies and nothing else, no INSERT or DELETE
 * grant for any role, and a trigger that rejects a slug rename. Rows are created by migration.
 * So the admin panel cannot add or drop a developer even if a future edit to this file tried.
 */

import { supabase } from '@/lib/supabase';
import { developerProfiles } from '@/data/developers';
import type { Developer, DeveloperLinks } from '@/types';

interface DeveloperLinkRow {
  slug: string;
  portfolio_url: string | null;
  linkedin_url: string | null;
  email: string | null;
  github_url: string | null;
  phone: string | null;
}

const columns = 'slug,portfolio_url,linkedin_url,email,github_url,phone';

/** Column names differ from the domain names on purpose, so neither side bends to the other. */
const rowToLinks = (row: DeveloperLinkRow): DeveloperLinks => ({
  portfolio: row.portfolio_url ?? undefined,
  linkedin: row.linkedin_url ?? undefined,
  email: row.email ?? undefined,
  github: row.github_url ?? undefined,
  phone: row.phone ?? undefined,
});

/** Empty strings become NULL so "cleared" and "never set" are the same thing in the database. */
const blankToNull = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const linksToRow = (links: DeveloperLinks) => ({
  portfolio_url: blankToNull(links.portfolio),
  linkedin_url: blankToNull(links.linkedin),
  email: blankToNull(links.email),
  github_url: blankToNull(links.github),
  phone: blankToNull(links.phone),
});

/** A missing table means the migration has not been applied yet; fall back rather than crash. */
const isMissingTable = (code?: string) => code === '42P01' || code === 'PGRST205';

async function refreshAuthSession() {
  await supabase.auth.refreshSession();
}

export const developerLinksService = {
  /**
   * The roster with links merged in. A developer with no row yet still appears, just without
   * links — the page must never lose a person because their contact details are missing.
   */
  async list(): Promise<Developer[]> {
    const { data, error } = await supabase.from('developer_links').select(columns);

    if (error && !isMissingTable(error.code)) throw new Error(error.message);

    const bySlug = new Map(
      ((data ?? []) as DeveloperLinkRow[]).map((row) => [row.slug, rowToLinks(row)])
    );

    return developerProfiles.map((profile) => ({
      ...profile,
      links: bySlug.get(profile.id) ?? {},
    }));
  },

  /**
   * Updates one developer's links. `slug` is never sent — it is the key, the database refuses
   * to let it change, and including it in an update payload would only invite that attempt.
   */
  async updateLinks(slug: string, links: DeveloperLinks): Promise<void> {
    await refreshAuthSession();

    const { error } = await supabase
      .from('developer_links')
      .update({ ...linksToRow(links), updated_at: new Date().toISOString() })
      .eq('slug', slug);

    if (error) {
      if (error.code === '42501') {
        throw new Error('Only content managers can edit developer links.');
      }
      throw new Error(error.message);
    }
  },
};
