import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import {
  BrainstormerCard,
  CreditSectionHeader,
  DeveloperCreditCard,
  FounderCard,
} from '@/components/credits/CreditCards';
import { BRAINSTORMERS, CREDITED_IDS, DEVELOPERS, FOUNDER, FOUNDER_HIGHLIGHTS } from '@/data/developers';
import { developerProfilesService } from '@/services/developerProfilesService';
import type { CreditProfile } from '@/types';

const breadcrumb = [{ label: 'Home', to: '/' }, { label: 'Developers' }];

/**
 * The people who built the hub, in three parts: who started it, who wrote it, and who shaped the
 * idea.
 *
 * Renders in full on the first paint. Names and credited work are in code, so there is nothing to
 * wait for before showing who did what — the profile read only fills in portraits, designations
 * and links, and every card already knows how to look without them (a placeholder portrait, no
 * designation line, no link row). A slow or failed read therefore costs a little polish, never a
 * person's place on their own credits.
 */
export default function DevelopersPage() {
  const reduceMotion = useReducedMotion();
  const [profiles, setProfiles] = useState<Map<string, CreditProfile>>(() => new Map());

  useEffect(() => {
    let ignore = false;
    developerProfilesService
      .listProfiles()
      .then((loaded) => {
        if (!ignore) setProfiles(loaded);
      })
      .catch((error) => {
        // Deliberately not surfaced to visitors: the page is complete without these, and a banner
        // saying "profiles could not be loaded" over a page of credits reads as though the
        // credits themselves are in doubt.
        console.error('Could not load developer profiles', error);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const founder = useMemo(() => developerProfilesService.resolve(FOUNDER, profiles), [profiles]);
  const developers = useMemo(
    () =>
      DEVELOPERS.map((credit) => ({
        person: developerProfilesService.resolve(credit.id, profiles),
        work: credit.work,
      })),
    [profiles]
  );
  const brainstormers = useMemo(
    () => BRAINSTORMERS.map((id) => developerProfilesService.resolve(id, profiles)),
    [profiles]
  );

  const reveal = (delay = 0) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.4, delay },
        };

  return (
    <div className="relative">
      <PageHero
        eyebrow="Credits"
        breadcrumb={breadcrumb}
        title="The People Behind the Hub"
        subtitle="Built by students of the IEEE Computer Society chapter at COMSATS University Islamabad — the person who started it, the people who wrote it, and everyone who helped shape the idea."
        meta={[
          { value: String(DEVELOPERS.length), label: DEVELOPERS.length === 1 ? 'Developer' : 'Developers' },
          { value: String(CREDITED_IDS.length), label: 'People credited' },
        ]}
      />

      <PageSection tone="cream" top>
        {/* ---- 1. Founder ------------------------------------------------ */}
        <section aria-labelledby="credits-founder">
          <CreditSectionHeader
            id="credits-founder"
            index="01 — Founder"
            title="Where it started"
            description="The person who initiated the hub and presided over its making."
          />
          <motion.div {...reveal()}>
            <FounderCard person={founder} highlights={FOUNDER_HIGHLIGHTS} />
          </motion.div>
        </section>

        {/* ---- 2. Developers --------------------------------------------- */}
        <section aria-labelledby="credits-developers" className="mt-16 sm:mt-20">
          <CreditSectionHeader
            id="credits-developers"
            index="02 — Developers"
            title="Who built it"
            description="The people who wrote the code, and what each of them was responsible for."
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {developers.map(({ person, work }, index) => (
              <motion.div key={person.id} {...reveal(index * 0.06)}>
                <DeveloperCreditCard person={person} work={work} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---- 3. Brainstormers ------------------------------------------ */}
        <section aria-labelledby="credits-brainstormers" className="mt-16 sm:mt-20">
          <CreditSectionHeader
            id="credits-brainstormers"
            index="03 — Brainstormers"
            title="Who shaped the idea"
            description="Everyone whose ideas went into what the hub became — including the founder and the developers above."
          />
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {brainstormers.map((person, index) => (
              <motion.li key={person.id} {...reveal((index % 5) * 0.04)}>
                <BrainstormerCard person={person} />
              </motion.li>
            ))}
          </ul>
        </section>
      </PageSection>
    </div>
  );
}
