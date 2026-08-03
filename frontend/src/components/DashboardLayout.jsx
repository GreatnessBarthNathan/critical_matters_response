import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, BookOpenText, ChevronDown, CircleHelp, FileLock2, FilePlus2, Files, LayoutDashboard, LogOut, Menu, Search, UserRound, UsersRound, X } from 'lucide-react';
import Brand from './Brand';
import { useAuth } from '../context/AuthContext';

const userLinks = [
  { to: '/app', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/app/reports/new', label: 'Create report', icon: FilePlus2 },
  { to: '/app/reports', end: true, label: 'General reports', icon: Files },
  { to: '/app/reports/private', label: 'Private reports', icon: FileLock2 },
];
const pastorLinks = [
  { to: '/app', end: true, label: 'Pastor overview', icon: LayoutDashboard },
  { to: '/app/reports', label: 'All reports', icon: Files },
  { to: '/app/reports/private', label: 'Private matters', icon: FileLock2 },
  { to: '/app/people', label: 'Church leaders', icon: UsersRound },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  const links = user.role === 'pastor' ? pastorLinks : userLinks;
  const signOut = async () => { await logout(); navigate('/login'); };
  const title = location.pathname.includes('/reports/new') ? 'Create a report' : location.pathname.includes('/reports/private') ? 'Private reports' : location.pathname.includes('/reports/') ? 'Report conversation' : location.pathname.includes('/reports') ? (user.role === 'pastor' ? 'All reports' : 'General reports') : location.pathname.includes('/profile') ? 'My profile' : location.pathname.includes('/people') ? 'Church leaders' : location.pathname.includes('/help') ? 'Help & privacy' : user.role === 'pastor' ? 'Pastoral care overview' : 'Your care space';

  return (
    <div className="dashboard-shell">
      {menuOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand"><Brand light /><button onClick={() => setMenuOpen(false)}><X /></button></div>
        <div className="sidebar__role"><span className="avatar avatar--small" style={{ background: user.avatarColor }}>{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.role === 'pastor' ? 'Pastor administrator' : user.ministry || 'Church leader'}</small></div></div>
        <nav className="sidebar__nav">
          <small>Workspace</small>
          {links.map(({ to, end, label, icon: Icon }) => <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>)}
          <small>Account</small>
          <NavLink to="/app/profile"><UserRound size={19} /><span>Profile & security</span></NavLink>
          <NavLink to="/app/help"><CircleHelp size={19} /><span>Help & privacy</span></NavLink>
        </nav>
        <div className="sidebar__promise"><BookOpenText size={20} /><strong>A confidential promise</strong><p>Every matter shared here is visible only to you and your pastor.</p></div>
        <button className="sidebar__logout" onClick={signOut}><LogOut size={18} /> Sign out</button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div><span className="topbar__crumb">Critical Matters Response</span><h1>{title}</h1></div>
          <div className="topbar__actions">
            <button className="icon-button search-button" aria-label="Search"><Search size={19} /></button>
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <div className="profile-menu"><button onClick={() => setProfileOpen(!profileOpen)}><span className="avatar avatar--tiny" style={{ background: user.avatarColor }}>{user.firstName[0]}{user.lastName[0]}</span><span>{user.firstName}</span><ChevronDown size={15} /></button>{profileOpen && <div className="profile-popover"><LinkItem to="/app/profile" onClick={() => setProfileOpen(false)}>View profile</LinkItem><button onClick={signOut}>Sign out</button></div>}</div>
          </div>
        </header>
        <main className="workspace__content"><Outlet /></main>
      </section>
    </div>
  );
}

function LinkItem({ to, onClick, children }) {
  return <NavLink to={to} onClick={onClick}>{children}</NavLink>;
}
