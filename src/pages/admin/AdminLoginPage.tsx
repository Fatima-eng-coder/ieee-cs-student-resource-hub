import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck, AlertCircle, Mail, Lock, ArrowLeft } from 'lucide-react';
import { adminAuthService } from '@/services/adminAuthService';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminAuthService.loginAdmin(form.email, form.password);
      navigate('/portal/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ieee-ink px-4">
      {/* ambient */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-ieee-orange/20 blur-[120px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)',
        }}
      />

      <Link
        to="/"
        className="absolute left-5 top-5 z-10 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-white/40 transition hover:text-ieee-orange"
      >
        <ArrowLeft className="h-4 w-4" /> Live site
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ieee-ink text-white shadow-lg">
            <ShieldCheck className="h-7 w-7 text-ieee-orange" />
          </span>
        </div>
        <h1 className="mt-4 text-center font-display text-2xl font-bold text-slate-900">Team Portal</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Authorized IEEE CS team members only</p>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3">
          <label className="group flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 transition focus-within:border-ieee-orange focus-within:ring-2 focus-within:ring-ieee-orange/20">
            <Mail className="h-4 w-4 text-slate-400 transition group-focus-within:text-ieee-orange" />
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@ieeecs.edu"
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>
          <label className="group flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 transition focus-within:border-ieee-orange focus-within:ring-2 focus-within:ring-ieee-orange/20">
            <Lock className="h-4 w-4 text-slate-400 transition group-focus-within:text-ieee-orange" />
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Password"
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>

          {error && (
            <p className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition hover:bg-ieee-orange-dark disabled:opacity-70"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Enter Portal
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Use your IEEE CS society account. Student accounts cannot enter this portal.
        </p>
      </motion.div>
    </div>
  );
}
