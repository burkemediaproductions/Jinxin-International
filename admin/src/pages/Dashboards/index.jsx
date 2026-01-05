// admin/src/pages/Dashboards/index.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useDashboard } from "../../hooks/useDashboard";

// -----------------------------------------------------------------------------
// This install: single-purpose dashboard
// - Show ONLY "My Assigned Surrogate Cases" for ALL users
// - No builder UI, no other widgets, no edit/remove actions
// -----------------------------------------------------------------------------

function getCurrentRole() {
  try {
    const raw = localStorage.getItem("serviceup.user");
    if (!raw) return "ADMIN";
    const parsed = JSON.parse(raw);
    return (parsed.role || "ADMIN").toUpperCase();
  } catch {
    return "ADMIN";
  }
}

// The one and only widget we want to show for everyone in this install.
const DEFAULT_WIDGETS = [
  {
    id: "my-assigned-surrogate-cases",
    type: "my-assigned-surrogate-cases",
    title: "My Assigned Surrogate Cases",
    // roles omitted intentionally => visible to all roles/users
    config: {
      limit: 10,
      linkBase: "/admin/content/surrogates",
    },
  },
];

function MyAssignedSurrogateCasesWidget({ config }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const limit = config?.limit ?? 10;
  const linkBase = config?.linkBase || "/admin/content/surrogates";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setBusy(true);
        setErr("");

        // Backend should return only cases assigned to current user
        const res = await api.get(
          `/api/dashboard/my-assigned-cases?limit=${encodeURIComponent(limit)}`
        );

        const rows = Array.isArray(res) ? res : res?.data || [];
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) setErr("Could not load your assigned surrogate cases.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (busy) return <p className="su-text-muted">Loading…</p>;
  if (err) return <p className="su-text-muted">{err}</p>;
  if (!items.length) return <p className="su-text-muted">No assigned cases found.</p>;

  return (
    <ul className="su-dashboard-list" style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((row) => {
        const idOrSlug = row?.slug || row?.id;
        const title =
          row?.title ||
          row?.data?.title ||
          row?.data?._title ||
          row?.data?.name?.full ||
          "(untitled)";

        const status = row?.status || row?.data?.status;

        return (
          <li key={row.id} className="su-dashboard-list__item" style={{ marginBottom: 8 }}>
            <a className="su-link" href={`${linkBase}/${idOrSlug}`}>
              {title}
            </a>
            {status ? (
              <span className="su-text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                {status}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  // Keep the hook so the page still respects your existing loading/error states,
  // but we intentionally IGNORE widgets from storage for this install.
  const { loading, saving, error } = useDashboard();

  const currentRole = getCurrentRole();

  // Force only the default widget(s) for this install.
  const visibleWidgets = useMemo(() => DEFAULT_WIDGETS, []);

  function renderWidget(widget) {
    const { id, type, title, config = {} } = widget;
    const key = id || `${type}-${Math.random()}`;

    return (
      <div key={key} className="su-card su-dashboard-widget">
        <div className="su-dashboard-widget__header">
          <h3>{title || "Widget"}</h3>
          {/* No actions (Edit/Remove) for this install */}
        </div>

        <div className="su-dashboard-widget__body">
          {type === "my-assigned-surrogate-cases" && (
            <MyAssignedSurrogateCasesWidget config={config} />
          )}

          {type !== "my-assigned-surrogate-cases" && (
            <p className="su-text-muted">
              Unknown widget type: <code>{type}</code>.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="su-page su-page--dashboard">
      <div className="su-page-header">
        <div>
          <h1 className="su-page-title">Dashboard</h1>
          <p className="su-page-subtitle">
            Role: <strong>{currentRole}</strong>.
          </p>
        </div>
        <div className="su-page-header__actions">
          {saving && (
            <span className="su-text-muted" style={{ fontSize: 12 }}>
              Saving…
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="su-alert su-alert--error">
          <div className="su-alert__title">Dashboard error</div>
          <div className="su-alert__body">{error}</div>
        </div>
      )}

      {/* Builder intentionally removed for this install */}

      <section className="su-dashboard-widgets">
        {loading ? (
          <p className="su-text-muted">Loading dashboard…</p>
        ) : (
          <div className="su-grid cols-2 gap-lg">
            {visibleWidgets.map((w) => renderWidget(w))}
          </div>
        )}
      </section>
    </div>
  );
}
