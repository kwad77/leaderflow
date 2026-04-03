import React, { useEffect } from 'react';
import { OrgChart } from '../components/OrgChart';
import { FlowPanel } from '../components/FlowPanel';
import { NodeDetail } from '../components/NodeDetail';
import { TriageModal } from '../components/Triage';
import { MetricsDashboard } from '../components/Metrics';
import { DemoTour } from './DemoTour';
import { useAppStore } from '../stores/appStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  MOCK_ORG,
  MOCK_ORG_TREE,
  MOCK_ITEMS,
  MOCK_BRIEFING,
  MOCK_WEEKLY,
  MOCK_AUTOMATION_OPPORTUNITIES,
} from './mockData';
import type { OrgTree } from '@leaderflow/shared';

function flattenTree(node: OrgTree): OrgTree[] {
  return [node, ...node.directReports.flatMap(flattenTree)];
}

export const DemoApp: React.FC = () => {
  const {
    orgTree,
    items,
    selectedMemberId,
    metricsOpen,
    setOrg,
    setItems,
    setBriefing,
    setMetricsOpen,
    setIsOnline,
  } = useAppStore();

  const isOnline = useOnlineStatus();

  // Sync online status to store
  useEffect(() => {
    setIsOnline(isOnline);
  }, [isOnline, setIsOnline]);

  // Seed store with mock data immediately — no API calls ever made
  useEffect(() => {
    setOrg(MOCK_ORG.id, MOCK_ORG.name, MOCK_ORG_TREE);
    setItems(MOCK_ITEMS);
    setBriefing(MOCK_BRIEFING);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!orgTree) return null;

  const allMembers = flattenTree(orgTree);
  const selectedMember = selectedMemberId
    ? allMembers.find((m) => m.id === selectedMemberId)
    : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* DEMO badge */}
      <div
        style={{
          position: 'fixed',
          top: 8,
          right: 60,
          zIndex: 200,
          background: '#7c3aed',
          color: '#fff',
          padding: '3px 10px',
          borderRadius: 12,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          pointerEvents: 'none',
        }}
      >
        DEMO
      </div>

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
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
        <span style={{ color: '#334155', fontSize: 14 }}>·</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>Acme Corp</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            localStorage.removeItem('leaderflow-demo-tour-done');
            window.location.reload();
          }}
          style={{
            padding: '4px 10px',
            background: 'none',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#475569',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          Replay Tour
        </button>
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
      </div>

      {/* Org chart */}
      <div
        style={{
          position: 'absolute',
          top: 44,
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
            top: 44,
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

      {/* Flow panel — reads from store, no API calls needed */}
      <FlowPanel />

      {/* Triage modal */}
      <TriageModal />

      {/* Metrics dashboard with demo data */}
      <MetricsDashboard
        isDemo
        demoWeeklyData={MOCK_WEEKLY}
        demoOpportunities={MOCK_AUTOMATION_OPPORTUNITIES}
      />

      {/* Guided tour overlay */}
      <DemoTour />
    </div>
  );
};
