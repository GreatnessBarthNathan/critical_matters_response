import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Archive, CircleHelp, LogOut, UsersRound } from 'lucide-react'
import Brand from './Brand'
import MobileNav, { tabsForRole } from './MobileNav'
import { useAuth } from '../context/AuthContext'

// Desktop sidebar carries the same destinations as the phone tabs, plus secondary pages.
const secondaryLinks = {
  user: [
    { to: '/app/reports/archived', label: 'Archive', icon: Archive },
    { to: '/app/help', label: 'Help & privacy', icon: CircleHelp },
  ],
  admin: [
    { to: '/app/reports/archived', label: 'Archive', icon: Archive },
    { to: '/app/people', label: 'Leaders', icon: UsersRound },
    { to: '/app/help', label: 'Help & privacy', icon: CircleHelp },
  ],
}

const TITLES = [
  ['/app/reports/new', 'Share a matter'],
  ['/app/reports/archived', 'Archive'],
  ['/app/reports/', 'Matter'],
  ['/app/reports', 'Matters'],
  ['/app/invitations', 'Invitations'],
  ['/app/security', 'Security & audit'],
  ['/app/profile', 'Profile'],
  ['/app/people', 'Leaders'],
  ['/app/help', 'Help & privacy'],
]

function pageTitle(pathname, role) {
  const match = TITLES.find(([prefix]) => pathname.startsWith(prefix))
  if (match) return match[1]
  return role === 'admin' ? 'Overview' : 'Home'
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const primary = tabsForRole(user.role)
  const secondary = secondaryLinks[user.role === 'admin' ? 'admin' : 'user']

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className='app-shell'>
      <a className='skip-link' href='#main-content'>
        Skip to main content
      </a>
      {/* Desktop-only sidebar; phones use the bottom navigation instead. */}
      <aside className='app-sidebar'>
        <div className='app-sidebar__brand'>
          <Brand />
        </div>
        <div className='app-sidebar__who'>
          <span
            className='avatar avatar--small'
            style={{ background: user.avatarColor }}
          >
            {user.firstName[0]}
            {user.lastName[0]}
          </span>
          <span>
            <strong>
              {user.firstName} {user.lastName}
            </strong>
            <small>
              {user.role === 'admin'
                ? 'Admin'
                : user.ministry || 'Church leader'}
            </small>
          </span>
        </div>
        <nav className='app-sidebar__nav' aria-label='Sections'>
          {primary.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} aria-hidden='true' />
              <span>{label}</span>
            </NavLink>
          ))}
          <hr />
          {secondary.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={18} aria-hidden='true' />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button type='button' className='app-sidebar__logout' onClick={signOut}>
          <LogOut size={17} aria-hidden='true' /> Sign out
        </button>
      </aside>

      <div className='app-main'>
        <header className='app-header'>
          <Brand compact />
          <h1>{pageTitle(location.pathname, user.role)}</h1>
          <button
            type='button'
            className='app-header__logout'
            onClick={signOut}
            aria-label='Sign out'
          >
            <LogOut size={18} aria-hidden='true' />
          </button>
        </header>
        <main className='app-content' id='main-content' tabIndex={-1}>
          <Outlet />
        </main>
        <MobileNav role={user.role} />
      </div>
    </div>
  )
}
