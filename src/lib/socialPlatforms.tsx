import type { ComponentType } from 'react';
import { Briefcase, Globe, Link as LinkIcon, Mail } from 'lucide-react';

import {
  FacebookIcon,
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/ui/SocialIcons';
import type { MemberLinkType } from '@/types';

/** Every platform either kind of link can be tagged with, member or chapter. */
export type PlatformKey = MemberLinkType | 'website';

interface PlatformMeta {
  /** Shown when a link carries no label of its own, and as the accessible name. */
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

const PLATFORMS: Record<PlatformKey, PlatformMeta> = {
  portfolio: { label: 'Portfolio', Icon: Briefcase },
  github: { label: 'GitHub', Icon: GitHubIcon },
  linkedin: { label: 'LinkedIn', Icon: LinkedInIcon },
  instagram: { label: 'Instagram', Icon: InstagramIcon },
  facebook: { label: 'Facebook', Icon: FacebookIcon },
  x: { label: 'X', Icon: XIcon },
  youtube: { label: 'YouTube', Icon: YouTubeIcon },
  email: { label: 'Email', Icon: Mail },
  website: { label: 'Website', Icon: Globe },
  other: { label: 'Link', Icon: LinkIcon },
};

export const platformMeta = (key: string): PlatformMeta =>
  PLATFORMS[key as PlatformKey] ?? PLATFORMS.other;

export const platformKeys = Object.keys(PLATFORMS) as PlatformKey[];

/**
 * What actually goes in `href`.
 *
 * Admins type what they know -- "ahsan@example.com", "github.com/ahsan", "@ieeecs" -- and a
 * bare host in an href is read as a path relative to the current page, so the link would point
 * at /github.com/ahsan on our own site and 404. Everything is normalised here, once, rather
 * than at each of the places that render a link.
 */
export function hrefForLink(type: string, url: string): string {
  const value = url.trim();
  if (!value) return '';

  if (type === 'email') {
    return value.startsWith('mailto:') ? value : `mailto:${value.replace(/^\/+/, '')}`;
  }
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  // A leading slash means an in-site path and is left alone; anything else gets a scheme.
  if (value.startsWith('/')) return value;
  return `https://${value}`;
}
