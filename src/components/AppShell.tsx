import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { AppNotification } from '../lib/types';
import { cx, initials, timeAgo } from '../lib/utils';
import GeminiDock from './GeminiDock';

interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof ICONS;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: Record<string, NavGroup[]> = {
  admin: [
    {
      title: 'Operations',
      items: [
        { to: '/admin', label: 'Overview', icon: 'grid' },
        { to: '/assistant', label: 'Flow', icon: 'flow' },
        { to: '/pulse', label: 'Campus Pulse', icon: 'map' },
        { to: '/admin/complaints', label: 'Complaints', icon: 'ticket' },
        { to: '/incidents', label: 'Incidents', icon: 'layers' },
        { to: '/intelligence', label: 'Intelligence', icon: 'spark' },
        { to: '/verification', label: 'Verification', icon: 'check' },
        { to: '/escalation', label: 'Escalation', icon: 'alert' },
        { to: '/community', label: 'Community', icon: 'users' },
        { to: '/surveys', label: 'Surveys', icon: 'inbox' },
      ],
    },
    {
      title: 'Analytics',
      items: [
        { to: '/recurrence', label: 'Recurrence Radar', icon: 'radar' },
        { to: '/scorecard', label: 'Reliability Scorecard', icon: 'chart' },
        { to: '/fairqueue', label: 'FairQueue', icon: 'chart' },
        { to: '/graph', label: 'Dependencies', icon: 'route' },
        { to: '/lab', label: 'Request Lab', icon: 'pen' },
        { to: '/signals', label: 'Quiet Signals', icon: 'radar' },
      ],
    },
    {
      title: 'Institution',
      items: [
        { to: '/admin/departments', label: 'Departments', icon: 'building' },
        { to: '/admin/users', label: 'Users', icon: 'users' },
        { to: '/admin/routing', label: 'Routing', icon: 'route' },
        { to: '/admin/join-requests', label: 'Join Requests', icon: 'inbox' },
        { to: '/admin/settings', label: 'Settings', icon: 'gear' },
        { to: '/admin/policies', label: 'Procedures', icon: 'inbox' },
      ],
    },
  ],
  teacher: [
    {
      title: 'Work',
      items: [
        { to: '/staff', label: 'My Work', icon: 'grid' },
        { to: '/assistant', label: 'Flow', icon: 'flow' },
        { to: '/staff/complaints', label: 'Department Queue', icon: 'ticket' },
        { to: '/pulse', label: 'Campus Pulse', icon: 'map' },
      ],
    },
    {
      title: 'Incidents',
      items: [
        { to: '/incidents', label: 'Incidents', icon: 'layers' },
        { to: '/intelligence', label: 'Intelligence', icon: 'spark' },
        { to: '/verification', label: 'Verification', icon: 'check' },
        { to: '/surveys', label: 'Surveys', icon: 'inbox' },
        { to: '/fairqueue', label: 'FairQueue', icon: 'chart' },
        { to: '/graph', label: 'Dependencies', icon: 'route' },
        { to: '/lab', label: 'Request Lab', icon: 'pen' },
        { to: '/signals', label: 'Quiet Signals', icon: 'radar' },
      ],
    },
    {
      title: 'Me',
      items: [
        { to: '/community', label: 'Community', icon: 'users' },
        { to: '/notifications', label: 'Notifications', icon: 'bell' },
      ],
    },
  ],
  student: [
    {
      title: 'My tickets',
      items: [
        { to: '/student', label: 'My Complaints', icon: 'grid' },
        { to: '/assistant', label: 'Flow', icon: 'flow' },
        { to: '/student/new', label: 'Report an Issue', icon: 'pen' },
        { to: '/student/tickets', label: 'All Tickets', icon: 'ticket' },
      ],
    },
    {
      title: 'Campus',
      items: [
        { to: '/pulse', label: 'Campus Pulse', icon: 'map' },
        { to: '/community', label: 'Community', icon: 'users' },
        { to: '/student/updates', label: 'Incident Updates', icon: 'layers' },
        { to: '/student/surveys', label: 'Surveys', icon: 'inbox' },
        { to: '/student/receipts', label: 'Decision Receipts', icon: 'check' },
        { to: '/notifications', label: 'Notifications', icon: 'bell' },
      ],
    },
  ],
};

const ICONS: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  ticket: 'M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 2v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-2V8z',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  spark: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2',
  flow: 'M3 8.5c3-4 6.5-4 9.5 0s6.5 4 9.5 0M3 15.5c3-4 6.5-4 9.5 0s6.5 4 9.5 0',
  check: 'M4 12.5 9.5 18 20 6.5',
  alert: 'M12 3 2.5 20h19L12 3zM12 10v4M12 17.5v.5',
  radar: 'M12 12h.01M12 3a9 9 0 0 1 9 9M12 7a5 5 0 0 1 5 5M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M4 21h16M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 16.5 15 10M9 19h6a3.5 3.5 0 0 0 3.5-3.5V12',
  inbox: 'M4 13l2.5-8h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6zM4 13h5a3 3 0 0 0 6 0h5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.4l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.09a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  pen: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={cx('h-[18px] w-[18px]', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ''} />
    </svg>
  );
}

const sideLink = (isActive: boolean) =>
  cx(
    'flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-[13.5px] font-semibold transition-colors',
    isActive ? 'bg-candy-ink text-white shadow-sm' : 'text-slate-500 hover:bg-candy-lavender/70 hover:text-slate-900',
  );

// A few high-traffic shortcuts for the top pill bar — the sidebar has everything.
const TOP_NAV: Record<string, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Overview', icon: 'grid' },
    { to: '/pulse', label: 'Campus Pulse', icon: 'map' },
    { to: '/admin/complaints', label: 'Complaints', icon: 'ticket' },
    { to: '/incidents', label: 'Incidents', icon: 'layers' },
  ],
  teacher: [
    { to: '/staff', label: 'My Work', icon: 'grid' },
    { to: '/pulse', label: 'Campus Pulse', icon: 'map' },
    { to: '/staff/complaints', label: 'Queue', icon: 'ticket' },
    { to: '/incidents', label: 'Incidents', icon: 'layers' },
  ],
  student: [
    { to: '/student', label: 'My Complaints', icon: 'grid' },
    { to: '/pulse', label: 'Campus Pulse', icon: 'map' },
    { to: '/student/new', label: 'Report an Issue', icon: 'pen' },
    { to: '/student/updates', label: 'Updates', icon: 'layers' },
  ],
};

const pillLink = (isActive: boolean) =>
  cx(
    'whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
    isActive ? 'bg-candy-ink text-white' : 'text-slate-500 hover:bg-candy-lavender/80 hover:text-slate-900',
  );

export default function AppShell() {
  const { profile, institution } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cf_sidebar_collapsed') === '1');
  const [dark, setDark] = useState(() => localStorage.getItem('cf_theme') === 'dark');
  const groups = NAV[profile?.role ?? 'student'] ?? [];
  const home = profile?.role === 'admin' ? '/admin' : profile?.role === 'teacher' ? '/staff' : '/student';

  useEffect(() => {
    localStorage.setItem('cf_theme', dark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141414' : '#ffffff');
  }, [dark]);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      localStorage.setItem('cf_sidebar_collapsed', c ? '0' : '1');
      return !c;
    });
  };

  const navContent = (onNavigate?: () => void) => (
    <>
      <Link to={home} onClick={onNavigate} className="flex items-center px-3 pb-5 pt-2" aria-label="Campflow home">
        <span className="text-lg font-extrabold tracking-tight">campflow</span>
      </Link>
      {institution?.name && (
        <p className="mx-2 mb-5 truncate px-3 text-xs font-semibold text-slate-400" title={institution.name}>
          {institution.name}
        </p>
      )}
      <nav className="flex-1 space-y-6 overflow-y-auto px-1 pb-4" aria-label="Main navigation">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{g.title}</p>
            <div className="space-y-1">
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to.split('/').length <= 2}
                  onClick={onNavigate}
                  title={item.label}
                  className={({ isActive }) => sideLink(isActive)}
                >
                  <NavIcon name={item.icon} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className={cx('cf-app min-h-screen bg-[#eef0f6] text-slate-900', dark && 'dark')}>
      {/* Desktop sidebar */}
      <aside className={cx(
        'fixed bottom-3 left-3 top-3 z-30 hidden w-[252px] flex-col rounded-[28px] bg-white px-2 py-4 shadow-[0_10px_40px_rgba(36,25,85,0.06)] transition-transform duration-300 lg:flex',
        collapsed && '-translate-x-[120%]',
      )}>
        {navContent()}
        <button
          onClick={toggleSidebar}
          className="mx-2 mt-1 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-candy-lavender/60 hover:text-slate-700"
          aria-label="Hide sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          Hide sidebar
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-white px-2 py-4 shadow-2xl"
            onKeyDown={(e) => { if (e.key === 'Escape') setMobileNav(false); }}>
            {navContent(() => setMobileNav(false))}
          </aside>
        </div>
      )}

      <div className={cx('flex min-h-screen flex-col transition-[padding] duration-300', collapsed ? 'lg:pl-0' : 'lg:pl-[276px]')}>
        <header className="sticky top-0 z-20 px-3 pt-3 md:px-5">
          <div className="flex h-16 items-center gap-3 rounded-full bg-white px-3 shadow-[0_8px_28px_rgba(36,25,85,0.05)]">
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 lg:hidden"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label={mobileNav ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileNav}
            >
              {mobileNav ? '✕' : '☰'}
            </button>
            {collapsed && (
              <button
                onClick={toggleSidebar}
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 lg:flex"
                aria-label="Show sidebar"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            )}
            <span className="shrink-0 text-base font-extrabold tracking-tight lg:hidden">campflow</span>
            {collapsed && <span className="hidden shrink-0 text-base font-extrabold tracking-tight lg:block">campflow</span>}

            <nav className="mx-auto hidden max-w-full items-center gap-1 overflow-x-auto rounded-full bg-slate-50 p-1.5 lg:flex" aria-label="Quick navigation">
              {(TOP_NAV[profile?.role ?? 'student'] ?? []).map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to.split('/').length <= 2} className={({ isActive }) => pillLink(isActive)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
              <ThemeToggle dark={dark} onToggle={() => setDark((value) => !value)} />
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] flex-1 px-3 pb-12 pt-5 md:px-5">
          <div className="cc-animate">
            <Outlet />
          </div>
        </main>
      </div>
      <GeminiDock />
    </div>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);
    setItems(data ?? []);
    setUnread((data ?? []).filter((n) => !n.read_at).length);
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => void load())
      .subscribe();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('mousedown', onClick);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = async (n: AppNotification) => {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    setOpen(false);
    if (n.complaint_id) {
      navigate(`/notifications`);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-slate-100">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto border-t border-slate-50">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className={cx(
                  'block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50',
                  !n.read_at && 'bg-brand-50/60',
                )}
              >
                <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
        aria-label="Account menu"
      >
        {initials(profile?.full_name ?? '?')}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-[22px] bg-white py-1.5 shadow-xl ring-1 ring-slate-100">
          <div className="border-b border-slate-50 px-4 py-2.5">
            <p className="truncate text-sm font-bold">{profile?.full_name}</p>
            <p className="truncate text-xs text-slate-400">{profile?.email}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
            className="block w-full px-4 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Profile settings
          </button>
          <button
            onClick={signOut}
            className="block w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
