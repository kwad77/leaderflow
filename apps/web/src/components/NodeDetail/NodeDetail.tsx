import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { WorkItemRow } from '../FlowPanel/WorkItemRow';
import { useWorkItems } from '../../hooks/useWorkItems';
import type { OrgMember, WorkItem } from '@leaderflow/shared';

interface NodeDetailProps {
  member: OrgMember;
  items: WorkItem[];
}

const ROLE_COLOR_MAP: Record<string, string> = {
  CEO: '#f59e0b',
  VP: '#a78bfa',
  Engineer: '#34d399',
  Manager: '#60a5fa',
  Director: '#fb7185',
};

function getRoleColor(role: string): string {
  for (const [key, color] of Object.entries(ROLE_COLOR_MAP)) {
    if (role.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#94a3b8';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const NodeDetail: React.FC<NodeDetailProps> = ({ member, items }) => {
  const { setSelectedMember, openTriage } = useAppStore();
  const { refresh } = useWorkItems();

  const activeItems = items.filter(
    (i) =>
      (i.toMemberId === member.id || i.fromMemberId === member.id) &&
      !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );

  const escalations = activeItems.filter((i) => i.type === 'ESCALATION');
  const delegations = activeItems.filter((i) => i.type === 'DELEGATION');
  const ingress = activeItems.filter((i) => i.type === 'INGRESS');
  const atRisk = activeItems.filter((i) => ['AT_RISK', 'OVERDUE', 'STALE'].includes(i.status));

  const roleColor = getRoleColor(member.role);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 300,
        maxHeight: 'calc(100vh - 200px)',
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid #1e293b',
          background: `linear-gradient(135deg, #0f172a, ${roleColor}11)`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: roleColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: 'white',
              flexShrink: 0,
            }}
          >
            {getInitials(member.name)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#f1f5f9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {member.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: roleColor,
                fontWeight: 600,
                marginTop: 1,
              }}
            >
              {member.role}
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
              {member.email}
            </div>
          </div>

          <button
            onClick={() => setSelectedMember(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 2px',
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 10,
          }}
        >
          {[
            { label: 'Ingress', count: ingress.length, color: '#f97316' },
            { label: 'Escalations', count: escalations.length, color: '#ef4444' },
            { label: 'Delegations', count: delegations.length, color: '#3b82f6' },
            { label: 'At Risk', count: atRisk.length, color: '#eab308' },
          ].map(({ label, count, color }) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: 'center',
                background: '#1e293b',
                borderRadius: 6,
                padding: '4px 2px',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color }}>{count}</div>
              <div style={{ fontSize: 8, color: '#64748b', marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => openTriage()}
          style={{
            flex: 1,
            padding: '7px 0',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            border: 'none',
            borderRadius: 7,
            color: 'white',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Item
        </button>
      </div>

      {/* Work items list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {activeItems.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#475569',
              fontSize: 12,
              marginTop: 24,
            }}
          >
            No active items
          </div>
        ) : (
          activeItems
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((item) => (
              <WorkItemRow key={item.id} item={item} onAction={refresh} />
            ))
        )}
      </div>
    </div>
  );
};
