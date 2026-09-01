import { createElement } from 'react';
import { categoryMeta } from '@/lib/navigation/data';
import { categoryIcon } from './navIcons';

/**
 * The tinted square badge used for a place everywhere it is listed — search results,
 * recents, the map's place card.
 *
 * The icon is looked up and instantiated with `createElement` rather than assigned to a
 * capitalised local, which keeps it obvious that it is a stable module-level component
 * being rendered, not a new component type being built during render.
 */
export default function CategoryGlyph({ category, className = '' }: { category: string; className?: string }) {
  const meta = categoryMeta(category);

  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${meta.chip} ${className}`}
    >
      {createElement(categoryIcon(category), { className: 'h-[1.05rem] w-[1.05rem]', strokeWidth: 1.9 })}
    </span>
  );
}
