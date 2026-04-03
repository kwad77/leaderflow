import React, { useState, useRef, KeyboardEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import { WorkItemRow } from '../FlowPanel/WorkItemRow';
import { useWorkItems } from '../../hooks/useWorkItems';
import type { OrgMember, WorkItem, WorkItemUpdate } from '@leaderflow/shared';
import { addItemComment, relativeTime } from '../../lib/api';

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

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#64748b',
  ACKNOWLEDGED: '#3b82f6',
  IN_PROGRESS: '#8b5cf6',
  ON_TRACK: '#22c55e',
  AT_RISK: '#eab308',
  STALE: '#f97316',
  OVERDUE: '#ef4444',
  COMPLETED: '#10b981',
  ARCHIVED: '#475569',
};

interface ActivityFeedProps {
  item: WorkItem;
  onCommentAdded: (itemId: string, update: WorkItemUpdate) => void;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ item, onCommentAdded }) => {
  const [updates, setUpdates] = useState<WorkItemUpdate[]>(item.updates);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmed = noteText.trim();
    if (!trimmed || submitting) return;

    // Optimistic update
    const optimistic: WorkItemUpdate = {
      id: `optimistic-${Date.now()}`,
      itemId: item.id,
      note: trimmed,
      authorId: null,
      statusChange: null,
      createdAt: new Date().toISOString(),
    };
    setUpdates((prev) => [...prev, optimistic]);
    setNoteText('');
    setSubmitting(true);

    try {
      const created = await addItemComment(item.id, trimmed);
      setUpdates((prev) =>
        prev.map((u) => (u.id === optimistic.id ? created : u))
      );
      onCommentAdded(item.id, created);
    } catch {
      // Roll back on error
      setUpdates((prev) => prev.filter((u) => u.id !== optimistic.id));
      setNoteText(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div
      style={{
        background: '#0a1628',
        borderTop: '1px solid #1e293b',
        padding: '8px 10px 10px',
      }}
    >
      {/* Timeline */}
      {updates.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {updates.map((u, idx) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: idx < updates.length - 1 ? 6 : 0,
              }}
            >
              {/* Left border + dot */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 12,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: u.statusChange
                      ? STATUS_COLORS[u.statusChange] ?? '#334155'
                      : '#334155',
                    marginTop: 3,
                    flexShrink: 0,
                  }}
                />
                {idx < updates.length - 1 && (
                  <div
                    style={{
                      width: 1,
                      flex: 1,
                      background: '#1e293b',
                      marginTop: 3,
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {u.statusChange && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: STATUS_COLORS[u.statusChange] ?? '#64748b',
                        background: `${STATUS_COLORS[u.statusChange] ?? '#64748b'}22`,
                        borderRadius: 4,
                        padding: '1px 5px',
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                      }}
                    >
                      {u.statusChange}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: '#64748b',
                      flexShrink: 0,
                    }}
                  >
                    {relativeTime(u.createdAt)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#cbd5e1',
                    marginTop: 2,
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}
                >
                  {u.note}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Add note..."
          disabled={submitting}
          style={{
            flex: 1,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 5,
            padding: '4px 7px',
            fontSize: 11,
            color: '#f1f5f9',
            outline: 'none',
            minWidth: 0,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !noteText.trim()}
          style={{
            background: noteText.trim() && !submitting ? '#3b82f6' : '#1e293b',
            border: 'none',
            borderRadius: 5,
            color: noteText.trim() && !submitting ? 'white' : '#475569',
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 9px',
            cursor: noteText.trim() && !submitting ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export const NodeDetail: React.FC<NodeDetailProps> = ({ member, items }) => {
  const { setSelectedMember, openTriage } = useAppStore();
  const { refresh } = useWorkItems();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // Track locally added comments so we can reflect them without a full refresh
  const [localUpdates, setLocalUpdates] = useState<Record<string, WorkItemUpdate[]>>({});

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

  const handleToggleItem = (itemId: string) => {
    setSelectedItemId((prev) => (prev === itemId ? null : itemId));
  };

  const handleCommentAdded = (itemId: string, update: WorkItemUpdate) => {
    setLocalUpdates((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), update],
    }));
  };

  // Merge local comments into item updates for the feed
  const enrichedItem = (item: WorkItem): WorkItem => {
    const extras = localUpdates[item.id] ?? [];
    if (extras.length === 0) return item;
    const existingIds = new Set(item.updates.map((u) => u.id));
    const newExtras = extras.filter((u) => !existingIds.has(u.id));
    return { ...item, updates: [...item.updates, ...newExtras] };
  };

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
            .map((item) => {
              const isExpanded = selectedItemId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    border: `1px solid ${isExpanded ? '#334155' : 'transparent'}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    transition: 'border-color 0.15s',
                    marginBottom: isExpanded ? 6 : 0,
                  }}
                >
                  {/* Clickable item row wrapper */}
                  <div
                    onClick={() => handleToggleItem(item.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <WorkItemRow item={item} onAction={refresh} />
                  </div>

                  {/* Activity feed — shown when item is expanded */}
                  {isExpanded && (
                    <ActivityFeed
                      item={enrichedItem(item)}
                      onCommentAdded={handleCommentAdded}
                    />
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};
