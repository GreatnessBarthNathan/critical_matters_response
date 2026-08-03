import { NavLink } from 'react-router-dom';
import { FilePlus2, Files, KeyRound, LayoutDashboard, MailPlus, UserRound } from 'lucide-react';

// Leaders: Home, Reports, Create, Profile. Pastors: Overview, Reports, Invitations, Security, Profile.
export const leaderTabs = [
  { to: '/app', end: true, label: 'Home', icon: LayoutDashboard },
  { to: '/app/reports', end: true, label: 'Reports', icon: Files },
  { to: '/app/reports/new', label: 'Create', icon: FilePlus2 },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
];

export const pastorTabs = [
  { to: '/app', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/app/reports', end: true, label: 'Reports', icon: Files },
  { to: '/app/invitations', label: 'Invitations', icon: MailPlus },
  { to: '/app/security', label: 'Security', icon: KeyRound },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
];

export function tabsForRole(role) {
  return role === 'pastor' ? pastorTabs : leaderTabs;
}

/**
 * Bottom navigation for phones. Every target is at least var(--touch-target) tall, shows an
 * icon *and* text, respects the safe-area inset, and is hidden at the desktop-sidebar
 * breakpoint by CSS. NavLink sets aria-current="page" on the active tab itself.
 */
export default function MobileNav({ role }) {
  const tabs = tabsForRole(role);

  return (
    <nav className="mobile-nav" aria-label="Main">
      <ul style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(({ to, end, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => `mobile-nav__tab ${isActive ? 'mobile-nav__tab--active' : ''}`}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="mobile-nav__label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
