
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { initials } from '../../utils/format';
import {
  LayoutDashboard, ArrowLeftRight, Link2, TrendingUp,
  ScrollText, LogOut, Zap,
} from 'lucide-react';



const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
  { to: '/mappings',     icon: Link2,           label: 'Registrar Mapping' },
  { to: '/income',       icon: TrendingUp,      label: 'Income Report' },
  { to: '/audit',        icon: ScrollText,      label: 'Audit Log' },
];


const PAGE_TITLES = {
  '/dashboard':    'Overview',
  '/transactions': 'Transactions',
  '/mappings':     'Registrar Mapping',
  '/income':       'Income Recognition',
  '/audit':        'Audit Log',
};



export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'VeriSage Pro';



  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <img 
              src="../src/images/verisage-logo.png" 
              alt="VeriSage Logo"
              className="logo-img"
            />
          </div>
          <div className="logo-text">Veri<span>Sage</span> Pro</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="user-avatar">{initials(user?.name || user?.email)}</div>
            <div className="user-info">
              <div className="name">{user?.name || user?.email}</div>
              <div className="role">{user?.role}</div>
            </div>
            <button
              onClick={logout}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-title">{title}</div>
        <div className="topbar-badge">NiRA · CoCCA–SAGE Bridge</div>
      </header>

      {/* Page content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );

}