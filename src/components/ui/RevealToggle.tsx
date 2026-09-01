import { Eye, EyeOff } from 'lucide-react';

/**
 * Show/hide control for a password box.
 *
 * The icon reports STATE, not the action: a crossed-out eye means "this is hidden right now",
 * an open eye means "this is readable right now". Both conventions exist in the wild — plenty
 * of sites draw the action instead, so an open eye means "press me to reveal" — and the two
 * are visually identical and opposite in meaning, which is why the first version of this read
 * backwards. State is the one people guess correctly, because the icon then agrees with what
 * they can see in the field beside it.
 *
 * The tooltip covers the other reading by naming the action outright, and the ARIA side uses
 * the toggle-button pattern — a label that does not move plus aria-pressed — so a screen
 * reader announces the state rather than a label whose meaning flips underneath it.
 *
 * type="button" matters: inside a form a bare button submits. It also sits inside the field's
 * label, which would otherwise swallow the click and just refocus the input.
 */
export default function RevealToggle({
  shown,
  onToggle,
  noun = 'password',
}: {
  shown: boolean;
  onToggle: () => void;
  /** Names the field in the tooltip when a form has more than one, e.g. "confirmation". */
  noun?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      title={shown ? `Hide ${noun}` : `Show ${noun}`}
      aria-label={`Show ${noun}`}
      aria-pressed={shown}
      className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/5 hover:text-slate-600"
    >
      {shown ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );
}
