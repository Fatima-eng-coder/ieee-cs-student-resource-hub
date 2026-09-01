/**
 * The card that hands people over to the 3D navigator.
 *
 * It lives on its own deployment because the 3D scene is heavy, and keeping it separate
 * means shipping changes there never touches this site. So the link opens in a new tab
 * rather than pulling the model into this page.
 *
 * The preview cross-fades through whatever screenshots are in `public/nav-3d/`; with none
 * present it draws an exploded axonometric of the building from the same dataset this page
 * routes on, so the card is never empty and never a stock photo. See NavigatorShowcase.
 */

import { ArrowUpRight, Download, Layers, MousePointerClick, WifiOff } from 'lucide-react';
import NavigatorShowcase from './NavigatorShowcase';

export const NAVIGATOR_3D_URL = 'https://muhammad-ahsan-001-cs-dept-navigator.vercel.app/';

const FEATURES = [
  {
    icon: Layers,
    title: 'All four floors in one view',
    body: 'Explode the block apart, hide the roof, or drop into a single floor.',
  },
  {
    icon: Download,
    title: 'Installs like an app',
    body: 'Add it to your home screen from the browser — no store, no sign-in.',
  },
  {
    icon: WifiOff,
    title: 'Works with no signal',
    body: 'Once installed it keeps working in the basement corridors and dead spots.',
  },
  {
    icon: MousePointerClick,
    title: 'Tap any room to route',
    body: 'Same rooms, same routes as this map — walked in 3D instead of drawn flat.',
  },
];

export default function ThreeDNavigatorCard() {
  return (
    <section className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        {/* ---- Preview -------------------------------------------- */}
        <div className="relative flex min-h-[17rem] flex-col justify-center overflow-hidden bg-[#EFE9DC] p-3 sm:p-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(120,100,70,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(120,100,70,0.10) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          <NavigatorShowcase />

          <span className="absolute top-4 left-4 rounded-full bg-white/85 px-3 py-1 font-mono text-[10px] font-semibold tracking-widest text-[#6F5F45] uppercase backdrop-blur">
            3D · separate app
          </span>
        </div>

        {/* ---- Copy ------------------------------------------------ */}
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="font-mono text-[11px] font-semibold tracking-widest text-ieee-orange uppercase">
            Companion app
          </p>
          <h2 className="mt-3 font-display text-2xl leading-tight font-bold text-slate-900 sm:text-3xl">
            Don't know the lab? Install the model and find it whenever you're stuck.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            The same building, walked in 3D. Because the model is heavy it runs as its own installable app — so it
            never slows this site down, and it keeps working after you've lost signal three floors up.
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ieee-orange/10 text-ieee-orange">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{body}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={NAVIGATOR_3D_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="link"
              className="group inline-flex items-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
            >
              Open the 3D navigator
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <p className="text-xs text-slate-400">
              Opens in a new tab · then use your browser's <span className="font-medium text-slate-500">Install app</span> option
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
