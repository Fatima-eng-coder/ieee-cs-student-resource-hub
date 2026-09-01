import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AtSign,
  GraduationCap,
  Hash,
  Loader2,
  Lock,
  Mail,
  Phone,
  User as UserIcon,
  Users,
} from 'lucide-react';
import {
  describeEmailRule,
  formatPakistaniMobile,
  isPakistaniMobile,
  isUniversityEmail,
  normalisePakistaniMobile,
  parseUniversityEmail,
  passwordIssues,
  passwordScore,
} from '@/utils/validation';
import RevealToggle from '@/components/ui/RevealToggle';
import type { LoginInput, SignupInput } from '@/services/authService';

interface AuthFormProps {
  mode: 'login' | 'signup';
  onModeChange: (m: 'login' | 'signup') => void;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  onSuccess?: () => void;
}

function Field({
  icon,
  hint,
  invalid,
  trailing,
  ...props
}: {
  icon: ReactNode;
  hint?: string;
  invalid?: boolean;
  /** Sits inside the field, to the right of the input — the reveal toggle uses it. */
  trailing?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label
        className={`group relative flex items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-all focus-within:ring-2 ${
          invalid
            ? 'border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-200'
            : 'border-black/10 focus-within:border-ieee-orange focus-within:ring-ieee-orange/20'
        }`}
      >
        <span className={`transition-colors ${invalid ? 'text-rose-400' : 'text-slate-400 group-focus-within:text-ieee-orange'}`}>
          {icon}
        </span>
        <input
          {...props}
          aria-invalid={invalid || undefined}
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {trailing}
      </label>
      {hint && <p className={`mt-1 px-1 text-xs ${invalid ? 'text-rose-600' : 'text-slate-400'}`}>{hint}</p>}
    </div>
  );
}

/** Four segments that fill as the password improves; the wording comes from the validator. */
function StrengthMeter({ score }: { score: number }) {
  const tone = ['bg-rose-400', 'bg-rose-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'][score];
  const word = ['Too weak', 'Too weak', 'Getting there', 'Good', 'Strong'][score];
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? tone : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="text-[11px] font-medium text-slate-500">{word}</span>
    </div>
  );
}

const emptyForm = {
  name: '',
  email: '',
  secondaryEmail: '',
  whatsapp: '',
  className: '',
  section: '',
  degree: '',
  password: '',
  confirm: '',
};

export default function AuthForm({ mode, onModeChange, login, signup, onSuccess }: AuthFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One toggle per box rather than one for both: confirming a password you cannot see is the
  // whole point of the second field, so revealing one must not reveal the other.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const signingUp = mode === 'signup';

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const blur = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));

  /* ---- live validation, only shown once a field has been left ---- */

  const emailOk = isUniversityEmail(form.email);
  const parsed = useMemo(() => parseUniversityEmail(form.email), [form.email]);
  // Required from here on: the university mailbox is the identity, this is the inbox the team
  // actually writes to.
  const secondaryOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.secondaryEmail.trim());
  const phoneOk = !form.whatsapp.trim() || isPakistaniMobile(form.whatsapp);
  const pwIssues = useMemo(
    () => (form.password ? passwordIssues(form.password, { email: form.email, name: form.name }) : []),
    [form.password, form.email, form.name]
  );
  const pwScore = useMemo(
    () => passwordScore(form.password, { email: form.email, name: form.name }),
    [form.password, form.email, form.name]
  );
  const confirmOk = !form.confirm || form.confirm === form.password;

  const canSubmit = signingUp
    ? Boolean(form.name.trim()) &&
      emailOk &&
      secondaryOk &&
      phoneOk &&
      pwIssues.length === 0 &&
      form.confirm === form.password
    : Boolean(form.email && form.password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (signingUp) {
        await signup({
          name: form.name,
          email: form.email,
          secondaryEmail: form.secondaryEmail,
          whatsapp: form.whatsapp,
          className: form.className,
          section: form.section,
          // The programme is already in the university address, so this is a confirmation
          // rather than a question — the service falls back to the parsed code.
          degree: form.degree || parsed?.programme?.toUpperCase() || '',
          password: form.password,
        });
      } else {
        await login({ email: form.email, password: form.password });
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {signingUp && (
        <Field
          icon={<UserIcon className="h-4 w-4" />}
          type="text"
          placeholder="Full name"
          autoComplete="name"
          required
          value={form.name}
          onChange={set('name')}
        />
      )}

      <Field
        icon={<Mail className="h-4 w-4" />}
        type="email"
        placeholder="fa24-bcs-059@isbstudent.comsats.edu.pk"
        autoComplete="username"
        required
        value={form.email}
        onChange={set('email')}
        onBlur={blur('email')}
        invalid={signingUp && touched.email && Boolean(form.email) && !emailOk}
        hint={
          signingUp
            ? touched.email && form.email && !emailOk
              ? describeEmailRule()
              : parsed
                ? `${parsed.programme.toUpperCase()} · batch ${parsed.session.toUpperCase()}${parsed.year} · roll ${parsed.roll}`
                : 'Use your university address.'
            : undefined
        }
      />

      {signingUp && (
        <>
          <Field
            icon={<AtSign className="h-4 w-4" />}
            type="email"
            placeholder="Personal email (Gmail)"
            autoComplete="email"
            required
            value={form.secondaryEmail}
            onChange={set('secondaryEmail')}
            onBlur={blur('secondaryEmail')}
            invalid={touched.secondaryEmail && Boolean(form.secondaryEmail) && !secondaryOk}
            hint={
              touched.secondaryEmail && form.secondaryEmail && !secondaryOk
                ? 'That does not look like an email address.'
                : 'We send everything here — results, reminders, event details.'
            }
          />

          <Field
            icon={<Phone className="h-4 w-4" />}
            type="tel"
            placeholder="WhatsApp — 0317 7880059"
            autoComplete="tel"
            value={form.whatsapp}
            onChange={set('whatsapp')}
            onBlur={blur('whatsapp')}
            invalid={touched.whatsapp && !phoneOk}
            hint={
              !phoneOk && touched.whatsapp
                ? 'That does not look like a Pakistani mobile number.'
                : form.whatsapp && phoneOk
                  ? `Saved as ${formatPakistaniMobile(normalisePakistaniMobile(form.whatsapp) ?? '')}`
                  : undefined
            }
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              icon={<Users className="h-4 w-4" />}
              type="text"
              placeholder="Class"
              value={form.className}
              onChange={set('className')}
            />
            <Field
              icon={<Hash className="h-4 w-4" />}
              type="text"
              placeholder="Section"
              maxLength={4}
              value={form.section}
              onChange={set('section')}
            />
          </div>

          <Field
            icon={<GraduationCap className="h-4 w-4" />}
            type="text"
            placeholder={parsed ? parsed.programme.toUpperCase() : 'Degree'}
            value={form.degree}
            onChange={set('degree')}
            hint={parsed && !form.degree ? 'Taken from your email — change it if that is wrong.' : undefined}
          />
        </>
      )}

      <Field
        icon={<Lock className="h-4 w-4" />}
        type={showPassword ? 'text' : 'password'}
        placeholder="Password"
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        required
        value={form.password}
        onChange={set('password')}
        onBlur={blur('password')}
        invalid={signingUp && touched.password && pwIssues.length > 0}
        trailing={<RevealToggle shown={showPassword} onToggle={() => setShowPassword((on) => !on)} />}
      />

      {signingUp && form.password && (
        <>
          <StrengthMeter score={pwScore} />
          {touched.password && pwIssues.length > 0 && (
            <ul className="flex flex-col gap-0.5 px-1">
              {pwIssues.slice(0, 3).map((issue) => (
                <li key={issue} className="text-xs text-slate-500">
                  · {issue}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {signingUp && (
        <Field
          icon={<Lock className="h-4 w-4" />}
          type={showConfirm ? 'text' : 'password'}
          placeholder="Confirm password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={set('confirm')}
          onBlur={blur('confirm')}
          invalid={touched.confirm && !confirmOk}
          hint={touched.confirm && !confirmOk ? 'The two passwords do not match.' : undefined}
          trailing={
            <RevealToggle
              shown={showConfirm}
              onToggle={() => setShowConfirm((on) => !on)}
              noun="confirmation"
            />
          }
        />
      )}

      {error && (
        <motion.p
          key={error}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </motion.p>
      )}

      <button
        type="submit"
        disabled={busy || !canSubmit}
        data-cursor="link"
        className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-ieee-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,108,12,0.32)] transition enabled:hover:bg-ieee-orange-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {signingUp ? 'Create account' : 'Log in'}
      </button>

      <p className="text-center text-sm text-slate-500">
        {signingUp ? 'Already have an account?' : 'New here?'}{' '}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setTouched({});
            onModeChange(signingUp ? 'login' : 'signup');
          }}
          className="font-semibold text-ieee-orange hover:underline"
        >
          {signingUp ? 'Log in' : 'Create one'}
        </button>
      </p>
    </form>
  );
}
