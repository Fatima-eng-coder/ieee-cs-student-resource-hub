/**
 * Everything about the current route: the summary, the floor-by-floor journey strip,
 * the full step list, and the walk-along guidance mode.
 *
 * The journey strip is the part that carries the multi-floor experience. Before you read
 * a single instruction it tells you "ground floor, then the lift, then the second floor",
 * and each card switches the map to that floor — so the answer to "which floor am I
 * looking at and why" is always one glance away.
 */

import { createElement, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Accessibility,
  ArrowLeftRight,
  Check,
  ChevronsUpDown,
  Footprints,
  Link2,
  Play,
  Timer,
  X,
} from 'lucide-react';
import type { DirectionStep, StepIcon as StepIconName } from '@/lib/navigation/directions';
import type { Route, RouteLeg, RouteTransition, TravelMode } from '@/lib/navigation/pathfinding';
import { stepIcon } from './navIcons';

/**
 * Renders the arrow for a step. Instantiating the looked-up icon with `createElement`
 * keeps it clear that this is a stable module-level component being rendered, not a new
 * component type being defined on every render.
 */
function StepArrow({ icon, className, strokeWidth }: { icon: StepIconName; className: string; strokeWidth: number }) {
  return createElement(stepIcon(icon), { className, strokeWidth });
}

interface RoutePanelProps {
  route: Route;
  steps: DirectionStep[];
  /** null when not in guidance mode. */
  activeStepIndex: number | null;
  activeFloorId: string;
  mode: TravelMode;
  onFloorChange: (floorId: string) => void;
  onStartGuidance: () => void;
  onExitGuidance: () => void;
  onStepChange: (index: number) => void;
  onModeChange: (mode: TravelMode) => void;
  onSwap: () => void;
  onClear: () => void;
  /** Copies the current URL — every route on this page is a shareable link. */
  onCopyLink: () => void;
  copied: boolean;
}

export default function RoutePanel({
  route,
  steps,
  activeStepIndex,
  activeFloorId,
  mode,
  onFloorChange,
  onStartGuidance,
  onExitGuidance,
  onStepChange,
  onModeChange,
  onSwap,
  onClear,
  onCopyLink,
  copied,
}: RoutePanelProps) {
  const guiding = activeStepIndex !== null;
  const sameFloor = route.transitions.length === 0;
  const step = guiding ? steps[activeStepIndex] : null;

  /**
   * Follow the walker onto the next floor automatically — the single most useful thing
   * the map can do during a multi-floor walk. Lives here rather than inside the step card
   * so it keeps running whichever way the panel is ordered.
   */
  useEffect(() => {
    if (step) onFloorChange(step.floorId);
  }, [step, onFloorChange]);

  /*
   * Source order is the desktop order; `order-*` re-stacks it on a phone.
   *
   * On a phone the map sits above the panel, so the Back/Next buttons have to be the very
   * first thing under it — otherwise every tap means scrolling back up to see what the map
   * just did. Distance, the stairs/lift choice and the floor strip are reference material,
   * so they drop below the instruction. On desktop the panel is a tall column beside the
   * map, nothing is out of sight, and the summary reads better at the top.
   */
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---- Controls: first thing under the map on mobile ---------- */}
      <div className="order-1 shrink-0 border-b border-black/5 px-4 py-3 sm:px-5 lg:order-3">
        {guiding ? (
          <GuidanceControls
            index={activeStepIndex}
            total={steps.length}
            onStepChange={onStepChange}
            onExit={onExitGuidance}
          />
        ) : (
          <button
            type="button"
            onClick={onStartGuidance}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-orange px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
          >
            <Play className="h-4 w-4 fill-current" />
            Walk me through it
          </button>
        )}
      </div>

      {/* ---- The instruction, or the whole list --------------------- */}
      {/*
        Swapped without a transition on purpose. This is a mode change the reader asked
        for by tapping, so it should be instant — and an AnimatePresence `mode="wait"`
        here would hold the new content back until the old one finished fading, which
        strands the panel empty if the exit animation ever stalls (a backgrounded tab,
        reduced motion). The per-step animation inside GuidanceStep is kept; that one
        earns its place by showing each new instruction arriving.
      */}
      <div className="order-2 min-h-0 overscroll-contain lg:order-4 lg:flex-1 lg:overflow-y-auto">
        {guiding && step ? (
          <GuidanceStep step={step} next={steps[activeStepIndex + 1]} />
        ) : (
          <ol className="space-y-0.5 px-4 py-3 sm:px-5">
            {steps.map((entry, i) => (
              <StepRow
                key={entry.id}
                step={entry}
                number={i}
                onClick={() => {
                  onFloorChange(entry.floorId);
                  onStepChange(i);
                  onExitGuidance();
                }}
              />
            ))}
          </ol>
        )}
      </div>

      {/* ---- Summary + how to change floors ------------------------- */}
      <div className="order-3 shrink-0 border-t border-black/5 px-4 py-3 sm:px-5 lg:order-1 lg:border-t-0 lg:border-b">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stat icon={<Footprints className="h-4 w-4" />} value={`${Math.round(route.walkMetres)} m`} label="walk" />
          <Stat icon={<Timer className="h-4 w-4" />} value={`${route.minutes} min`} label="approx." />
          {route.transitions.map((t) => (
            <Stat
              key={`${t.coreId}-${t.fromFloorId}`}
              icon={t.kind === 'elevator' ? <Accessibility className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              value={t.kind === 'elevator' ? '1 lift' : `${t.floors} flight${t.floors > 1 ? 's' : ''}`}
              label={t.coreName.replace('Staircase ', 'via ').replace('Elevator ', 'via ')}
            />
          ))}

          <div className="ml-auto flex items-center gap-1">
            <IconAction label={copied ? 'Route link copied' : 'Copy route link'} onClick={onCopyLink}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
            </IconAction>
            <IconAction label="Swap start and destination" onClick={onSwap}>
              <ArrowLeftRight className="h-4 w-4" />
            </IconAction>
            <IconAction label="Clear route" onClick={onClear}>
              <X className="h-4 w-4" />
            </IconAction>
          </div>
        </div>

        {/* Change floors by … — a hard choice, not a hint the router can overrule. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
            Change floors by
          </span>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="How to change floors">
            <ModeButton
              active={mode === 'stairs'}
              onClick={() => onModeChange('stairs')}
              icon={<ChevronsUpDown className="h-3.5 w-3.5" />}
              label="Stairs"
            />
            <ModeButton
              active={mode === 'lift'}
              onClick={() => onModeChange('lift')}
              icon={<Accessibility className="h-3.5 w-3.5" />}
              label="Lift"
              hint="step-free"
            />
          </div>
          {sameFloor && <span className="text-[11px] text-slate-400">Same floor — no change needed.</span>}
        </div>
      </div>

      {/* ---- Floor-by-floor journey -------------------------------- */}
      <JourneyStrip route={route} activeFloorId={activeFloorId} onFloorChange={onFloorChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Journey strip                                                       */
/* ------------------------------------------------------------------ */

function JourneyStrip({
  route,
  activeFloorId,
  onFloorChange,
}: {
  route: Route;
  activeFloorId: string;
  onFloorChange: (floorId: string) => void;
}) {
  if (route.legs.length < 2) return null;

  return (
    <div className="order-4 shrink-0 border-t border-black/5 bg-slate-50/70 px-4 py-3 sm:px-5 lg:order-2 lg:border-t-0 lg:border-b">
      <p className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
        {route.legs.length} floors on this route
      </p>
      <ol className="mt-2 flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {route.legs.map((leg, index) => (
          <li key={`${leg.floorId}-${index}`} className="flex shrink-0 items-center gap-1.5">
            <LegCard leg={leg} index={index} active={leg.floorId === activeFloorId} onClick={() => onFloorChange(leg.floorId)} />
            {leg.departVia && <TransitionPill transition={leg.departVia} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LegCard({
  leg,
  index,
  active,
  onClick,
}: {
  leg: RouteLeg;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`flex min-w-[7.5rem] flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
        active
          ? 'border-ieee-orange/40 bg-white shadow-sm ring-1 ring-ieee-orange/20'
          : 'border-black/5 bg-white/70 hover:border-black/10 hover:bg-white'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
            active ? 'bg-ieee-orange text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {index + 1}
        </span>
        <span className={`text-xs font-bold ${active ? 'text-slate-900' : 'text-slate-600'}`}>{leg.floorName}</span>
      </span>
      <span className="mt-0.5 font-mono text-[10px] text-slate-400">
        {Math.round(leg.distanceUnits * 0.5)} m walk
      </span>
    </button>
  );
}

function TransitionPill({ transition }: { transition: RouteTransition }) {
  const Icon = transition.kind === 'elevator' ? Accessibility : ChevronsUpDown;
  return (
    <span
      className="flex flex-col items-center gap-0.5 px-0.5 text-ieee-orange"
      title={`${transition.coreName}, ${transition.direction} ${transition.floors} floor${transition.floors > 1 ? 's' : ''}`}
    >
      <Icon className="h-4 w-4" />
      <span className="font-mono text-[9px] font-semibold">{transition.coreId}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Step list                                                           */
/* ------------------------------------------------------------------ */

function StepRow({ step, number, onClick }: { step: DirectionStep; number: number; onClick: () => void }) {
  const isMilestone = step.kind !== 'walk';

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50"
      >
        <span className="relative flex flex-col items-center">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isMilestone ? 'bg-ieee-orange/10 text-ieee-orange' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <StepArrow icon={step.icon} className="h-4 w-4" strokeWidth={2.1} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug font-medium text-slate-800">{step.text}</span>
          {step.detail && <span className="mt-0.5 block text-xs leading-snug text-slate-500">{step.detail}</span>}
        </span>
        <span className="shrink-0 pt-0.5 font-mono text-[10px] text-slate-300">{number + 1}</span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Guidance mode                                                       */
/*                                                                     */
/* Split in two so the panel can put the buttons directly under the    */
/* map on a phone while the instruction they act on sits below them.   */
/* ------------------------------------------------------------------ */

/** Back / Next, plus where you are in the walk. */
function GuidanceControls({
  index,
  total,
  onStepChange,
  onExit,
}: {
  index: number;
  total: number;
  onStepChange: (index: number) => void;
  onExit: () => void;
}) {
  const last = index === total - 1;

  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onStepChange(Math.max(0, index - 1))}
          disabled={index === 0}
          className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition enabled:hover:border-ieee-orange/40 enabled:hover:text-ieee-orange disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => (last ? onExit() : onStepChange(index + 1))}
          className="flex-[1.6] rounded-xl bg-ieee-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ieee-orange-dark"
        >
          {last ? 'Done' : 'Next step'}
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <span className="shrink-0 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
          Step {index + 1} / {total}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
          <motion.span
            className="block h-full rounded-full bg-ieee-orange"
            animate={{ width: `${((index + 1) / total) * 100}%` }}
            transition={{ type: 'spring', stiffness: 240, damping: 30 }}
          />
        </span>
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          All steps
        </button>
      </div>
    </div>
  );
}

/** The instruction itself, and a peek at what comes next. */
function GuidanceStep({ step, next }: { step: DirectionStep; next?: DirectionStep }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      {/*
        Keyed on the step id, so React swaps the instruction the moment it changes and
        framer animates the new one in. Deliberately NOT wrapped in AnimatePresence:
        `mode="wait"` holds the incoming instruction back until the outgoing one has
        finished exiting, and if that exit ever stalls the walker is left reading the
        wrong step while the buttons say otherwise. On a wayfinding screen that is worse
        than losing the transition.
      */}
      <div>
        <motion.div
          key={step.id}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="flex gap-4"
          aria-live="polite"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ieee-orange text-white shadow-sm">
            <StepArrow icon={step.icon} className="h-7 w-7" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-snug font-bold text-slate-900">{step.text}</p>
            {step.detail && <p className="mt-1 text-sm leading-snug text-slate-500">{step.detail}</p>}
          </div>
        </motion.div>
      </div>

      {next && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Then</span>
          <span className="min-w-0 flex-1 leading-snug">{next.text}</span>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ModeButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-white text-ieee-orange shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {icon}
      {label}
      {hint && <span className="font-normal text-slate-400">{hint}</span>}
    </button>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-ieee-orange">{icon}</span>
      <span className="leading-tight">
        <span className="block text-sm font-bold text-slate-900">{value}</span>
        <span className="block font-mono text-[9px] tracking-wide text-slate-400 uppercase">{label}</span>
      </span>
    </span>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </button>
  );
}
