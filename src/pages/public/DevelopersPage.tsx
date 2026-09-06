import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BookOpen, Code2, HeartHandshake, Users } from 'lucide-react';
import { developerLinksService } from '@/services/developerLinksService';
import { developerProfiles } from '@/data/developers';
import type { Developer } from '@/types';
import ComingSoon, { type MeanwhileLink } from '@/components/layout/ComingSoon';
import PageHero from '@/components/layout/PageHero';
import PageSection from '@/components/layout/PageSection';
import DeveloperCard from '@/components/cards/DeveloperCard';

const breadcrumb = [{ label: 'Home', to: '/' }, { label: 'Developers' }];

const meanwhile: MeanwhileLink[] = [
  {
    label: 'The Committee',
    description: 'The people running the chapter this year, and what each of them does.',
    to: '/about/hierarchy',
    icon: Users,
  },
  {
    label: 'Contribute',
    description: 'Send in a past paper, a course resource, or photos from an event.',
    to: '/contribute',
    icon: HeartHandshake,
  },
  {
    label: 'Courses',
    description: 'Course description forms, lab manuals and study resources.',
    to: '/courses',
    icon: BookOpen,
  },
];

/**
 * The parked screen, shown while the roster in src/data/developers.ts is empty.
 *
 * It used to list five invented people with stock avatars. A visitor has no way to tell an
 * invented contributor from a real one, so the page was crediting the work to nobody who did
 * it -- which is worse than saying nothing yet. Adding one real person to that file turns this
 * back into the full page with no other change.
 */
const parkedScreen = (
  <ComingSoon
    eyebrow="The Team"
    breadcrumb={breadcrumb}
    title="The people who built this are being credited properly."
    description="This hub is designed and built by student volunteers from the IEEE CS chapter. Their profiles are being written up before they go on the site, so this page is paused until they are ready."
    icon={Code2}
    meanwhile={meanwhile}
  />
);

export default function DevelopersPage() {
  /*
   * Starts from the hardcoded roster so the page renders instantly and in full even if the
   * link lookup is slow or fails — a developer without contact links is still a developer.
   */
  const [developers, setDevelopers] = useState<Developer[]>(() =>
    developerProfiles.map((profile) => ({ ...profile, links: {} }))
  );

  useEffect(() => {
    let ignore = false;
    developerLinksService
      .list()
      .then((merged) => {
        if (!ignore) setDevelopers(merged);
      })
      .catch((error) => {
        console.error('Could not load developer links', error);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // The roster is authored in code, so whether it is empty is known before render -- there is
  // no read to wait for and no flicker between the two states.
  if (developers.length === 0) return parkedScreen;

  return (
    <div className="relative">
      <PageHero
        compact
        eyebrow="The Team"
        breadcrumb={breadcrumb}
        title="Meet the Developers"
        subtitle="This resource hub is designed and built by student volunteers from the IEEE CS Islamabad Branch Chapter. Here's the team behind it."
        meta={[{ value: `${developers.length}`, label: 'Contributors' }]}
      />

      <PageSection tone="cream" top>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {developers.map((dev, idx) => (
            <motion.div
              key={dev.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35, delay: (idx % 3) * 0.05 }}
            >
              <DeveloperCard developer={dev} />
            </motion.div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
