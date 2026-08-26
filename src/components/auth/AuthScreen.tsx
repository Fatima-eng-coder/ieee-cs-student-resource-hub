import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Heart, MessageCircle, Repeat2, ShieldCheck } from 'lucide-react';
import AnimatedBackground from '@/components/effects/AnimatedBackground';
import AuthForm from '@/components/auth/AuthForm';
import BrandLogo from '@/components/ui/BrandLogo';
import { useAuth } from '@/context/AuthContext';

const perks = [
  { icon: Heart, label: 'Like the projects you love' },
  { icon: MessageCircle, label: 'Comment and share feedback' },
  { icon: Repeat2, label: 'Repost work worth spreading' },
  { icon: ShieldCheck, label: 'Browsing & downloads stay free' },
];

export default function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';

  useEffect(() => {
    if (user) navigate(redirect, { replace: true });
  }, [user, redirect, navigate]);

  const switchTo = (m: 'login' | 'signup') => {
    const q = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
    navigate(`/${m}${q}`);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-16">
      <AnimatedBackground />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-ieee-orange/15 blur-[120px]" />

      <Link
        to="/"
        data-cursor="link"
        className="absolute left-5 top-5 z-10 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-white/50 transition hover:text-ieee-orange"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>

      <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2">
        {/* Marketing side */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:block"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-ieee-orange backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-ieee-orange" />
            IEEE CS · Projects Community
          </span>
          <h1
            className="mt-6 font-display font-bold tracking-tight text-cream"
            style={{ fontSize: 'clamp(2.2rem, 3.5vw, 3.2rem)', lineHeight: 1.05 }}
          >
            Where students
            <br />
            <span className="text-ieee-orange">ship &amp; share.</span>
          </h1>
          <p className="mt-5 max-w-md text-white/60">
            Post your projects, get real feedback from your peers, and discover what everyone else is
            building. An account is only needed to interact — reading is always open.
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {perks.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.li
                  key={p.label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                  className="flex items-center gap-3 text-sm text-white/75"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-ieee-orange">
                    <Icon className="h-4 w-4" />
                  </span>
                  {p.label}
                </motion.li>
              );
            })}
          </ul>
        </motion.div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-white/95 p-7 shadow-2xl backdrop-blur-xl sm:p-9"
        >
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-9 w-9" />
            <span className="font-display text-sm font-bold tracking-tight text-slate-900">IEEE CS Hub</span>
          </div>

          <h2 className="mt-6 font-display text-2xl font-bold text-slate-900">
            {mode === 'signup' ? 'Create your account' : 'Log in to your account'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {mode === 'signup'
              ? 'Join the community in a few seconds.'
              : 'Welcome back — pick up where you left off.'}
          </p>

          <div className="mt-6">
            <AuthForm
              mode={mode}
              onModeChange={switchTo}
              login={login}
              signup={signup}
              onSuccess={() => navigate(redirect, { replace: true })}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
