import React from 'react';
import type { WorkItem } from '@leaderflow/shared';
import { acknowledgeItem, completeItem } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';

interface WorkItemRowProps {
  item: WorkItem;
  onAction: () => void;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#94a3b8',
  ACKNOWLEDGED: '#60a5fa',
  IN_PROGRESS: '#34d399',
  ON_TRACK: '#34d399',
  AT_RISK: '#ef4444',
  STALE: '#f97316',
  OVERDUE: '#dc2626',
  COMPLETED: '#6b7280',
  ARCHIVED: '#4b5563',
};

function slaLabel(dueAt: string | null | undefined): { label: string; color: string } | null {
  if (!dueAt) return null;
  const diffMs = new Date(dueAt).getTime() - Date.now();
  if (diffMs < 0) return { label: 'Overdue', color: '#ef4444' };
  const hours = diffMs / 3600000;
  if (hours < 4) return { label: `${Math.ceil(hours)}h`, color: '#ef4444' };
  if (hours < 24) return { label: `${Math.floor(hours)}h`, color: '#f59e0b' };
  return { label: `${Math.floor(hours / 24)}d`, color: '#22c55e' };
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export const WorkItemRow: React.FC<WorkItemRowProps> = ({ item, onAction, selected = false, onSelect }) => {
  const { openTriage, upsertItem, isOnline, currentUserRole } = useAppStore();

  const fromLabel = item.from?.name ?? item.fromExternal ?? 'External';
  const toLabel = item.to?.name ?? '?';

  const handleAcknowledge = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline) return;
    try {
      const updated = await acknowledgeItem(item.id);
      upsertItem(updated);
      onAction();
    } catch (err) {
      console.error('Acknowledge failed:', err);
    }
  };

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline) return;
    try {
      const updated = await completeItem(item.id);
      upsertItem(updated);
      onAction();
    } catch (err) {
      console.error('Complete failed:', err);
    }
  };

  const handleDelegate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline) return;
    openTriage(item);
  };

  // Members cannot delegate
  const canDelegate = currentUserRole !== 'member';

  return (
    <div
      className="work-item-row"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        background: '#1e293b',
        borderRadius: 8,
        marginBottom: 6,
        borderLeft: `3px solid ${selected ? '#3b82f6' : (STATUS_COLOR[item.status] ?? '#475569')}`,
        opacity: isOnline ? 1 : 0.7,
        outline: selected ? '1px solid #3b82f633' : 'none',
      }}
    >
      {/* Checkbox */}
      <div
        className="work-item-checkbox"
        onClick={(e) => { e.stopPropagation(); onSelect?.(item.id, !selected); }}
        style={{
          flexShrink: 0,
          marginTop: 2,
          width: 16,
          height: 16,
          borderRadius: 3,
          border: `1px solid ${selected ? '#3b82f6' : '#334155'}`,
          background: selected ? '#3b82f6' : '#1e293b',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.15s, background 0.15s, border-color 0.15s',
        }}
        role="checkbox"
        aria-checked={selected}
        aria-label="Select item"
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Row content */}
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#f1f5f9',
            flex: 1,
            lineHeight: 1.3,
          }}
        >
          {item.title}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: PRIORITY_COLOR[item.priority],
            background: `${PRIORITY_COLOR[item.priority]}22`,
            padding: '2px 6px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          {item.priority}
        </span>
      </div>

      {/* From → To + age */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          <span style={{ color: '#64748b' }}>{fromLabel}</span>
          {' → '}
          <span style={{ color: '#7dd3fc' }}>{toLabel}</span>
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          {formatAge(item.createdAt)}
        </span>
      </div>

      {/* Status + actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: STATUS_COLOR[item.status] ?? '#94a3b8',
              fontWeight: 600,
            }}
          >
            {item.status.replace('_', ' ')}
          </span>
          {(() => {
            const sla = slaLabel(item.dueAt);
            if (!sla) return null;
            return (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: sla.color,
                  background: `${sla.color}26`,
                  padding: '2px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {sla.label}
              </span>
            );
          })()}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {item.status === 'PENDING' && (
            <ActionButton
              label="Ack"
              color="#3b82f6"
              onClick={handleAcknowledge}
              disabled={!isOnline}
            />
          )}
          {canDelegate && item.type !== 'ESCALATION' && !['COMPLETED', 'ARCHIVED'].includes(item.status) && (
            <ActionButton
              label="Delegate"
              color="#8b5cf6"
              onClick={handleDelegate}
              disabled={!isOnline}
            />
          )}
          {!['COMPLETED', 'ARCHIVED'].includes(item.status) && (
            <ActionButton
              label="Done"
              color="#22c55e"
              onClick={handleComplete}
              disabled={!isOnline}
            />
          )}
        </div>
      </div>
      </div>{/* end row content */}

      <style>{`
        .work-item-row:hover .work-item-checkbox {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
};

const ActionButton: React.FC<{
  label: string;
  color: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}> = ({ label, color, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      fontSize: 10,
      fontWeight: 600,
      color: disabled ? '#475569' : color,
      background: disabled ? '#1e293b' : `${color}22`,
      border: `1px solid ${disabled ? '#334155' : `${color}44`}`,
      borderRadius: 4,
      padding: '2px 7px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {label}
  </button>
);
