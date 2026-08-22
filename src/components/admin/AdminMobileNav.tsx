import { NavLink, Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, LogOut, ArrowUpRight } from 'lucide-react';
import Icon from '@/components/ui/Icon';
import Avatar from '@/components/ui/Avatar';
import BrandLogo from '@/components/ui/BrandLogo';
import { adminNavGroups } from '@/components/admin/adminNav';
import { adminAuthService } from '@/services/adminAuthService';

/** Full admin navigation for phones/tablets — the drawer behind the topbar hamburger. */
export default function AdminMobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const admin = adminAuthService.getCurrentAdmin();

  const logout = async () => {
    await adminAuthService.logoutAdmin();
    onClose();
    navigate('/portal/login', { replace: true });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-ieee-ink/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute left-0 top-0 flex h-full w-[86%] max-w-xs flex-col bg-ieee-ink"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <BrandLogo className="h-9 w-9" />
                <div className="leading-tight">
                  <p className="font-display text-sm font-bold text-white">Team Portal</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">IEEE CS Admin</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {admin && (
              <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
                <Avatar name={admin.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{admin.name}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-wide text-ieee-orange">{admin.role}</p>
                </div>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {adminNavGroups.map((group) => (
                <div key={group.title} className="mb-4">
                  <p className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-white/25">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                            isActive ? 'bg-ieee-orange/15 text-ieee-orange' : 'text-white/60 hover:bg-white/5 hover:text-white'
                          }`
                        }
                      >
                        <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-white/5">
              <Link
                to="/"
                onClick={onClose}
                className="flex items-center justify-between px-4 py-3 text-xs font-medium text-white/40 hover:text-ieee-orange"
              >
                View live site <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 border-t border-white/5 px-4 py-3 text-sm font-semibold text-rose-400 hover:bg-white/5"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
