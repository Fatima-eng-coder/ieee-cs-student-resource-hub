import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Menu, X, LogOut, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Magnetic from '@/components/effects/Magnetic';
import Avatar from '@/components/ui/Avatar';
import BrandLogo from '@/components/ui/BrandLogo';
import { useAuth } from '@/context/AuthContext';
import { useNavLinks } from '@/hooks/useNavLinks';

/** Sub-pixel slack, so a rail scrolled fully to one end does not keep its arrow. */
const RAIL_EPSILON = 4;
/** How far one arrow press moves the rail, as a fraction of what is visible. */
const RAIL_STEP = 0.7;

/**
 * The navbar links, in a rail that scrolls when they do not fit.
 *
 * `min-w-0` is what lets it shrink at all: a flex child defaults to `min-width: auto` and
 * refuses to go below its content width, which is why the links used to run straight over the
 * buttons beside them — measured at 404px past, on a 1024px viewport.
 *
 * Shrinking alone only moved the problem: the overflow was simply clipped, so the last few links
 * silently vanished with nothing to say they existed. Hence the arrows, the same answer the
 * wayfinder's chip strip uses — each appears only on a side that has more to reach, fades the
 * links out beneath itself rather than colliding with them, and goes away at the end.
 *
 * Hidden from assistive tech on purpose: they are a redundant control for something a keyboard
 * or screen reader user already reaches by tabbing through the links themselves.
 */
function NavRail({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= RAIL_EPSILON);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - RAIL_EPSILON);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    measure();
    track.addEventListener('scroll', measure, { passive: true });

    // The rail starts and stops overflowing as the window resizes, as a font finishes loading,
    // and as the admin switches links on and off — so the children are watched too, not just
    // the track.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const child of Array.from(track.children)) observer.observe(child);

    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  const nudge = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * RAIL_STEP, behavior: 'smooth' });
  };

  return (
    <div className="relative hidden min-w-0 flex-1 lg:block">
      <div
        ref={trackRef}
        className="no-scrollbar flex items-center gap-0.5 overflow-x-auto scroll-smooth"
      >
        {children}
      </div>

      <RailArrow side="left" show={!atStart} onClick={() => nudge(-1)} />
      <RailArrow side="right" show={!atEnd} onClick={() => nudge(1)} />
    </div>
  );
}

function RailArrow({ side, show, onClick }: { side: 'left' | 'right'; show: boolean; onClick: () => void }) {
  const left = side === 'left';

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-y-0 flex items-center transition-opacity duration-200 ${
        left ? 'left-0 pr-5' : 'right-0 pl-5'
      } ${show ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{
        // A translucent white rather than a solid colour: the header is frosted, so a hard fade
        // to a page colour would print a pale block over whatever is showing through it.
        background: `linear-gradient(to ${left ? 'right' : 'left'}, rgba(255,255,255,0.92) 40%, rgba(255,255,255,0))`,
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onClick}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white/90 text-slate-500 shadow-sm transition hover:border-ieee-orange/40 hover:text-ieee-orange"
      >
        {left ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function Header() {
  const { user, logout } = useAuth();
  const { items: allNavLinks } = useNavLinks();
  const navItems = allNavLinks.filter((n) => n.enabled);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <header
        className={`glass-panel mx-auto flex max-w-[96rem] items-center gap-2 rounded-2xl border border-black/5 px-4 py-2.5 transition-shadow duration-300 sm:px-5 ${scrolled ? 'shadow-[0_8px_30px_rgba(10,10,12,0.12)]' : 'shadow-[0_4px_16px_rgba(10,10,12,0.06)]'
          }`}
      >
        <Link to="/" data-cursor="link" className="flex shrink-0 items-center gap-2.5">
          <BrandLogo className="h-10 w-10" />
          <span className="font-display text-sm font-bold tracking-tight text-slate-900">IEEE CS Hub</span>
        </Link>

        <NavRail>
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.to === '/'}
              data-cursor="link"
              className={({ isActive }) =>
                `relative whitespace-nowrap px-2.5 py-2 text-sm font-semibold transition-colors xl:px-3 ${isActive ? 'text-ieee-orange' : 'text-slate-600 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {item.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-ieee-orange"
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </NavRail>

        {/* ml-auto, not justify-between: the rail between these two is `hidden` below lg, and
            without it the search icon and the menu button bunch against the logo instead of
            sitting at the right edge where they belong. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Magnetic>
            <Link
              to="/search"
              data-cursor="link"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-black/5 hover:text-ieee-orange"
              aria-label="Search"
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={2} />
            </Link>
          </Magnetic>

          {user ? (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                data-cursor="link"
                className="flex items-center gap-1.5 rounded-full border border-black/5 py-1 pl-1 pr-2 transition hover:bg-black/5"
                aria-label="Account menu"
              >
                <Avatar name={user.name} src={user.avatar} size="sm" />
                <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-black/5 bg-white p-1.5 shadow-[0_12px_40px_rgba(10,10,12,0.16)]"
                    >
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <Avatar name={user.name} src={user.avatar} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                      <div className="my-1 h-px bg-black/5" />
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <LogOut className="h-4 w-4" /> Log out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link
                to="/login"
                data-cursor="link"
                className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:text-ieee-orange"
              >
                Log in
              </Link>
              <Magnetic>
                <Link
                  to="/signup"
                  data-cursor="link"
                  className="whitespace-nowrap rounded-full bg-ieee-orange px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(255,108,12,0.35)] transition hover:bg-ieee-orange-dark"
                >
                  Sign up
                </Link>
              </Magnetic>
            </div>
          )}

          <button
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-black/5 lg:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-auto mt-2 max-w-[96rem] overflow-hidden rounded-2xl glass-panel border border-black/5 lg:hidden"
          >
            {/*
              * Capped to the viewport and split in two. With enough links the sheet used to grow
              * past the bottom of the screen and take the log in and sign up buttons with it —
              * and on a phone those live nowhere else, so the site became unsignin-able.
              *
              * dvh rather than vh: on mobile browsers vh is the height with the URL bar hidden,
              * which is taller than what the reader can actually see.
              */}
            <div className="flex max-h-[calc(100dvh-7rem)] flex-col">
              <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-3">
                {navItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-3 text-sm font-semibold ${isActive ? 'text-ieee-orange' : 'text-slate-600'}`
                  }
                >
                  {item.label}
                </NavLink>
                ))}
              </div>

              {/* Outside the scroller on purpose: signing in is the one thing that must never
                  be below the fold, whatever the admin has added to the navbar. */}
              <div className="shrink-0 border-t border-black/5 px-4 pb-3 pt-3">
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={user.name} src={user.avatar} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                    className="rounded-lg px-3 py-3 text-left text-sm font-semibold text-rose-600"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg border border-black/10 px-3 py-3 text-center text-sm font-semibold text-slate-700"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg bg-ieee-orange px-3 py-3 text-center text-sm font-semibold text-white"
                  >
                    Sign up
                  </Link>
                </div>
              )}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
