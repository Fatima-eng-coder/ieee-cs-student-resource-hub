import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { adminAuthService } from '@/services/adminAuthService';
import Avatar from '@/components/ui/Avatar';
import AdminMobileNav from '@/components/admin/AdminMobileNav';

interface AdminTopbarProps {
  title: string;
  subtitle?: string;
  /** Optional primary action (e.g. an "Add" button) shown on the right. */
  action?: ReactNode;
}

const roleLabel: Record<string, string> = {
  webmaster: 'Webmaster',
  vice_chairperson: 'Vice Chairperson',
  chairperson: 'Chairperson',
  general_secretary: 'General Secretary',
  joint_secretary: 'Joint Secretary',
  graphic_designer: 'Graphic Designer',
  operations_manager: 'Operations Manager',
  treasurer: 'Treasurer',
};

export default function AdminTopbar({ title, subtitle, action }: AdminTopbarProps) {
  const navigate = useNavigate();
  const admin = adminAuthService.getCurrentAdmin();
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = async () => {
    await adminAuthService.logoutAdmin();
    navigate('/portal/login', { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/5 bg-white/85 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/5 text-slate-600 transition hover:border-ieee-orange/40 hover:text-ieee-orange lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold text-slate-900 sm:text-xl">{title}</h1>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {action}
          {admin && (
            <div className="hidden items-center gap-2.5 rounded-full border border-black/5 bg-cream/60 py-1 pl-1 pr-3 md:flex">
              <Avatar name={admin.name} size="sm" />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-slate-800">{admin.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-ieee-orange">
                  {roleLabel[admin.role] ?? admin.role}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="hidden items-center gap-1.5 rounded-full border border-black/5 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 sm:flex"
            aria-label="Log out"
          >
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <AdminMobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
