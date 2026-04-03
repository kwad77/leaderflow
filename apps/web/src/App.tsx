import React, { useEffect } from 'react';
import { OrgChart } from './components/OrgChart';
import { FlowPanel } from './components/FlowPanel';
import { NodeDetail } from './components/NodeDetail';
import { TriageModal } from './components/Triage';
import { MetricsDashboard } from './components/Metrics';
import { SettingsPanel } from './components/Settings';
import { useAppStore } from './stores/appStore';
import { useWorkItems } from './hooks/useWorkItems';
import { useRealtime } from './hooks/useRealtime';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { fetchOrgTree } from './lib/api';

function flattenTree(node: any): any[] {
  return [node, ...node.directReports.flatMap(flattenTree)];
}

const AppContent: React.FC = () => {
  const {
    orgId,
    orgName,
    orgTree,
    items,
    selectedMemberId,
    loading,
    error,
    metricsOpen,
    settingsOpen,
    setOrg,
    setError,
    setMetricsOpen,
    setSettingsOpen,
    setIsOnline,
    setCurrentUserRole,
  } = useAppStore();

  const isOnline = useOnlineStatus();

  // Sync online status to store
  useEffect(() => {
    setIsOnline(isOnline);
  }, [isOnline, setIsOnline]);

  // Read ?role= query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role') as 'leader' | 'manager' | 'member' | null;
    if (role && ['leader', 'manager', 'member'].includes(role)) {
      setCurrentUserRole(role);
    }
  }, [setCurrentUserRole]);

  // Load org tree on mount
  useEffect(() => {
    fetchOrgTree()
      .then(({ org, tree }) => {
        setOrg(org.id, org.name, tree);
      })
      .catch((err) => {
        setError(err.message);
      });
  }, [setOrg, setError]);

  // Load work items
  useWorkItems();

  // Real-time updates
  useRealtime(orgId);

  if (loading && !orgTree) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid #1e293b',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={{ color: '#475569', fontSize: 13 }}>Loading LeaderFlow...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !orgTree) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 12,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 24 }}>⚠</div>
        <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 600 }}>
          Failed to load
        </div>
        <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', maxWidth: 300 }}>
          {error}
        </div>
        <div style={{ color: '#475569', fontSize: 11, textAlign: 'center' }}>
          Make sure the API is running on port 3001 and the database has been seeded.
          <br />
          Run: <code style={{ color: '#7dd3fc' }}>docker-compose up -d && pnpm --filter api db:seed</code>
        </div>
      </div>
    );
  }

  if (!orgTree) return null;

  const allMembers = flattenTree(orgTree);
  const selectedMember = selectedMemberId
    ? allMembers.find((m: any) => m.id === selectedMemberId)
    : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Offline banner */}
      {!isOnline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#b45309',
            color: '#fef3c7',
            padding: '6px 16px',
            fontSize: 12,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>⚡</span>
          <span>Offline — showing last synced data. Changes are disabled.</span>
        </div>
      )}

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: isOnline ? 0 : 30,
          left: 0,
          right: 0,
          height: 44,
          background: 'rgba(15,23,42,0.9)',
          borderBottom: '1px solid #1e293b',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          zIndex: 50,
          gap: 10,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#f1f5f9',
            letterSpacing: '-0.02em',
          }}
        >
          LeaderFlow
        </span>
        {orgName && (
          <>
            <span style={{ color: '#334155', fontSize: 14 }}>·</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>{orgName}</span>
          </>
        )}

        {/* Weekly Review button + Settings gear */}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setMetricsOpen(true)}
          style={{
            padding: '5px 12px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Weekly Review
        </button>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          style={{
            width: 32,
            height: 32,
            background: settingsOpen ? '#1e40af' : '#1e293b',
            border: `1px solid ${settingsOpen ? '#3b82f6' : '#334155'}`,
            borderRadius: 6,
            color: settingsOpen ? '#93c5fd' : '#94a3b8',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      {/* Main org chart area */}
      <div
        style={{
          position: 'absolute',
          top: (isOnline ? 0 : 30) + 44,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <OrgChart root={orgTree} items={items} />
      </div>

      {/* Node detail panel */}
      {selectedMember && (
        <div
          style={{
            position: 'absolute',
            top: (isOnline ? 0 : 30) + 44,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'all' }}>
            <NodeDetail member={selectedMember} items={items} />
          </div>
        </div>
      )}

      {/* Flow panel (bottom) */}
      <FlowPanel />

      {/* Triage modal */}
      <TriageModal />

      {/* Metrics dashboard overlay */}
      <MetricsDashboard />

      {/* Settings panel */}
      {settingsOpen && <SettingsPanel />}
    </div>
  );
};

export default function App() {
  // Check if Clerk publishable key is configured
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (clerkKey) {
    // Wrap with ClerkProvider when key is available
    // Dynamic import to avoid hard dependency when key is absent
    const ClerkWrapper = React.lazy(() =>
      import('./ClerkProvider').catch(() => ({
        default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      }))
    );

    return (
      <React.Suspense fallback={null}>
        <ClerkWrapper>
          <AppContent />
        </ClerkWrapper>
      </React.Suspense>
    );
  }

  // Dev mode: no auth
  return <AppContent />;
}
