import { motion } from 'framer-motion';
import { Phone } from 'lucide-react';
import type { Developer } from '@/types';
import Icon from '@/components/ui/Icon';

interface DeveloperCardProps {
  developer: Developer;
}

export default function DeveloperCard({ developer }: DeveloperCardProps) {
  const { links } = developer;
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:shadow-md"
    >
      <img src={developer.photo} alt={developer.name} className="h-24 w-24 rounded-full object-cover" />
      <div>
        <h3 className="font-semibold text-slate-900">{developer.name}</h3>
        <p className="text-sm font-medium text-ieee-orange-dark">{developer.role}</p>
      </div>
      <p className="text-sm text-slate-600">{developer.contribution}</p>
      <p className="text-xs text-slate-400">{developer.bio}</p>

      <div className="mt-1 flex flex-wrap justify-center gap-1.5">
        {developer.skills.map((skill) => (
          <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
            {skill}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-slate-100 pt-4">
        {links.portfolio && (
          <a href={links.portfolio} target="_blank" rel="noreferrer" aria-label={`${developer.name} portfolio`} className="text-slate-400 hover:text-ieee-orange">
            <Icon name="external-link" className="h-5 w-5" />
          </a>
        )}
        {links.github && (
          <a href={links.github} target="_blank" rel="noreferrer" aria-label={`${developer.name} GitHub`} className="text-slate-400 hover:text-ieee-orange">
            <Icon name="link" className="h-5 w-5" />
          </a>
        )}
        {links.linkedin && (
          <a href={links.linkedin} target="_blank" rel="noreferrer" aria-label={`${developer.name} LinkedIn`} className="text-slate-400 hover:text-ieee-orange">
            <Icon name="users" className="h-5 w-5" />
          </a>
        )}
        {links.email && (
          <a href={`mailto:${links.email}`} aria-label={`Email ${developer.name}`} className="text-slate-400 hover:text-ieee-orange">
            <Icon name="mail" className="h-5 w-5" />
          </a>
        )}
        {links.phone && (
          <a href={`tel:${links.phone.replace(/\s+/g, '')}`} aria-label={`Call ${developer.name}`} className="text-slate-400 hover:text-ieee-orange">
            <Phone className="h-5 w-5" />
          </a>
        )}
      </div>
    </motion.div>
  );
}
