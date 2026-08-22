import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import type { User } from '@/types';
import { authService, type LoginInput, type SignupInput } from '@/services/authService';
import AuthForm from '@/components/auth/AuthForm';

interface AuthContextValue {
  user: User | null;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Returns true if already signed in; otherwise opens the login modal and
   *  runs `action` after a successful sign-in. */
  ensureAuth: (action?: () => void, reason?: string) => boolean;
  promptAuth: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => authService.getCurrentUser());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'login' | 'signup'>('login');
  const [reason, setReason] = useState<string | undefined>();
  const pendingAction = useRef<(() => void) | null>(null);

  const login = useCallback(async (input: LoginInput) => {
    setUser(await authService.login(input));
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    setUser(await authService.signup(input));
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  useEffect(() => {
    let ignore = false;

    authService.loadCurrentUser().then((currentUser) => {
      if (!ignore) setUser(currentUser);
    });

    return () => {
      ignore = true;
    };
  }, []);

  const ensureAuth = useCallback(
    (action?: () => void, why?: string) => {
      if (user) return true;
      pendingAction.current = action ?? null;
      setReason(why);
      setModalMode('login');
      setModalOpen(true);
      return false;
    },
    [user]
  );

  const promptAuth = useCallback((why?: string) => ensureAuth(undefined, why), [ensureAuth]);

  // Once a guest signs in from the modal, run whatever they were trying to do.
  useEffect(() => {
    if (user && modalOpen) {
      setModalOpen(false);
      const action = pendingAction.current;
      pendingAction.current = null;
      if (action) action();
    }
  }, [user, modalOpen]);

  const value = useMemo(
    () => ({ user, login, signup, logout, ensureAuth, promptAuth }),
    [user, login, signup, logout, ensureAuth, promptAuth]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-ieee-ink/70 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-black/5 bg-white p-7 shadow-2xl sm:p-8"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ieee-orange/15 blur-[80px]" />
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-black/5 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-ieee-orange/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-ieee-orange">
                <Sparkles className="h-3 w-3" /> Account needed
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold text-slate-900">
                {modalMode === 'signup' ? 'Join the community' : 'Welcome back'}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                {reason ?? 'Log in or create a free account to interact with projects.'}
              </p>

              <div className="mt-6">
                <AuthForm mode={modalMode} onModeChange={setModalMode} login={login} signup={signup} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
