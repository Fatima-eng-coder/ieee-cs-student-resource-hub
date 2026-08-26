import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { adminAuthService } from '@/services/adminAuthService';

/**
 * Route guard for the private /portal area. Only Supabase-authenticated IEEE CS
 * society members can enter; normal student accounts are bounced to login.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    let ignore = false;

    adminAuthService
      .loadCurrentAdmin()
      .then((profile) => {
        if (!ignore) setState(adminAuthService.canAccessPortal(profile) ? 'allowed' : 'denied');
      })
      .catch(() => {
        if (!ignore) setState('denied');
      });

    return () => {
      ignore = true;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f2ec] text-slate-500">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-4 w-4 animate-spin text-ieee-orange" />
          Checking portal access
        </span>
      </div>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/portal/login" replace />;
  }

  return <>{children}</>;
}
