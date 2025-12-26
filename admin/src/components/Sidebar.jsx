import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

// Best-effort role resolver so we can hide items/preview/slug for non-admin roles
// even when the parent app hasn't wired a role prop yet.
function getRoleFromToken() {
  try {
    const token =
      window.localStorage.getItem('token') ||
      window.localStorage.getItem('serviceup_token') ||
      window.localStorage.getItem('jwt') ||
      window.localStorage.getItem('authToken');
    if (!token) return null;
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join(''),
    );
    const payload = JSON.parse(json);
    return payload?.role || payload?.user?.role || payload?.claims?.role || null;
  } catch {
    return null;
  }
}

function clearAuthTokens() {
  const keys = ['token', 'serviceup_token', 'jwt', 'authToken', 'access_token'];
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

// Utility to check if the current role can see an item.  If the item has
// no roles specified (or roles is an empty array), it's visible to all.
const canSee = (itemRoles, role) => {
  if (!Array.isArray(itemRoles) || itemRoles.length === 0) return true;
  if (!role) return false;
  return itemRoles.includes(role);
};

// Stateless link component for sidebar links.  Applies a primary class when
// the NavLink matches the current location.
const SidebarLink = ({ to, label, target }) => (
  <NavLink
    to={to}
    target={target || '_self'}
    className={({ isActive }) =>
      'su-btn su-nav-link' + (isActive ? ' primary' : '')
    }
    style={{ display: 'block', marginBottom: 8 }}
  >
    {label}
  </NavLink>
);

/**
 * Sidebar renders a navigation sidebar.  It accepts an `onClose` callback
 * which will be called when the user clicks the mobile close button and a
 * `role` prop used to filter items by role.
 */
export default function Sidebar({ onClose, role }) {
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();

  const effectiveRole = useMemo(() => {
    const fromProp = role ? String(role).toUpperCase() : null;
    const fromToken = getRoleFromToken();
    return (fromProp || fromToken || 'ADMIN').toUpperCase();
  }, [role]);

  const handleLogout = () => {
    clearAuthTokens();
    // Choose your login route:
    navigate('/login', { replace: true });
  };

  // use hideChromeByRole (if desired) to hide entire sidebar for a role
  const hideChromeByRole = settings?.hideChromeByRole || {};
  const hideSidebar = !!hideChromeByRole[effectiveRole];
  if (hideSidebar) return null;

  const [isMobileOpen, setMobileOpen] = useState(false);

  // Basic nav items (you likely already have this list in your version).
  // Keep yours if it’s more complete — this component supports role filtering.
  const items = settings?.sidebarItems || [
    { label: 'Dashboard', to: '/admin' },
    { label: 'Content Types', to: '/admin/content-types' },
    { label: 'Settings', to: '/admin/settings' },
  ];

  useEffect(() => {
    // close on route change (mobile)
    setMobileOpen(false);
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <aside className="su-sidebar" aria-label="Sidebar navigation">
      <div className="su-sidebar-header su-flex su-justify-between su-items-center">
        <div className="su-text-sm su-text-muted">
          Role: <strong>{effectiveRole}</strong>
        </div>
        <button
          type="button"
          className="su-btn su-btn-ghost"
          onClick={() => setMobileOpen((v) => !v)}
        >
          ☰
        </button>
      </div>

      {items.map((item, i) => {
        if (!canSee(item.roles, effectiveRole)) return null;

        const isGroup = Array.isArray(item.children) && item.children.length > 0;
        const visibleChildren = isGroup
          ? item.children.filter((child) => canSee(child.roles, effectiveRole))
          : [];

        return (
          <div key={i} style={{ marginBottom: 8 }}>
            {item.to ? (
              <SidebarLink
                to={item.to}
                label={item.label || 'Link'}
                target={item.target}
              />
            ) : (
              <div className="su-text-xs su-text-muted" style={{ padding: '6px 0' }}>
                {item.label}
              </div>
            )}

            {visibleChildren.length > 0 && (
              <div style={{ paddingLeft: 10 }}>
                {visibleChildren.map((child, ci) =>
                  child.to ? (
                    <SidebarLink
                      key={ci}
                      to={child.to}
                      label={child.label || 'Link'}
                      target={child.target || item.target}
                    />
                  ) : null
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Logout pinned to bottom */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--su-border)' }}>
        <button
          type="button"
          className="su-btn su-nav-link"
          onClick={handleLogout}
          style={{ width: '100%', display: 'block' }}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
