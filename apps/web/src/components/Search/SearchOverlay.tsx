import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { OrgMember, OrgTree, WorkItem } from '@leaderflow/shared';

function flattenTree(node: OrgTree): OrgMember[] {
  return [node, ...node.directReports.flatMap(flattenTree)];
}

type ResultItem =
  | { kind: 'member'; member: OrgMember }
  | { kind: 'workitem'; item: WorkItem };

const TYPE_COLORS: Record<string, string> = {
  INGRESS: '#f97316',
  DELEGATION: '#3b82f6',
  ESCALATION: '#ef4444',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#64748b',
  ACKNOWLEDGED: '#3b82f6',
  IN_PROGRESS: '#8b5cf6',
  ON_TRACK: '#10b981',
  AT_RISK: '#f59e0b',
  STALE: '#94a3b8',
  OVERDUE: '#ef4444',
  COMPLETED: '#22c55e',
  ARCHIVED: '#475569',
};

export const SearchOverlay: React.FC = () => {
  const {
    searchOpen,
    setSearchOpen,
    orgTree,
    items,
    setSelectedMember,
    openTriage,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when overlay opens
  useEffect(() => {
    if (searchOpen) {
      setQuery('');
      setFocusedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [searchOpen]);

  const allMembers = useMemo(
    () => (orgTree ? flattenTree(orgTree) : []),
    [orgTree]
  );

  // Compute "most recently active" members by looking at items assigned to them
  const memberActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const ts = new Date(item.updatedAt).getTime();
      const prev = map.get(item.toMemberId) ?? 0;
      if (ts > prev) map.set(item.toMemberId, ts);
    }
    return map;
  }, [items]);

  const results: ResultItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Top 5 most recently active members
      const sorted = [...allMembers].sort((a, b) => {
        const ta = memberActivity.get(a.id) ?? 0;
        const tb = memberActivity.get(b.id) ?? 0;
        return tb - ta;
      });
      const topMembers: ResultItem[] = sorted
        .slice(0, 5)
        .map((m) => ({ kind: 'member', member: m }));

      // Top 5 most recently updated items
      const sortedItems = [...items]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5);
      const topItems: ResultItem[] = sortedItems.map((i) => ({ kind: 'workitem', item: i }));

      return [...topMembers, ...topItems];
    }

    const matchedMembers: ResultItem[] = allMembers
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      )
      .map((m) => ({ kind: 'member', member: m }));

    const matchedItems: ResultItem[] = items
      .filter((i) => i.title.toLowerCase().includes(q))
      .map((i) => ({ kind: 'workitem', item: i }));

    return [...matchedMembers, ...matchedItems];
  }, [query, allMembers, items, memberActivity]);

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current) return;
    const focused = listRef.current.querySelector<HTMLDivElement>(
      `[data-idx="${focusedIndex}"]`
    );
    focused?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const selectResult = useCallback(
    (result: ResultItem) => {
      if (result.kind === 'member') {
        setSelectedMember(result.member.id);
      } else {
        openTriage(result.item);
      }
      setSearchOpen(false);
    },
    [setSelectedMember, openTriage, setSearchOpen]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (results[focusedIndex]) {
          selectResult(results[focusedIndex]);
        }
      }
    },
    [results, focusedIndex, selectResult, setSearchOpen]
  );

  if (!searchOpen) return null;

  // Separate member and workitem results for section headers
  const memberResults = results.filter((r) => r.kind === 'member');
  const itemResults = results.filter((r) => r.kind === 'workitem');

  // Build a flat ordered list with section offsets for keyboard nav index alignment
  const orderedResults: ResultItem[] = [...memberResults, ...itemResults];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '15vh',
      }}
      onMouseDown={(e) => {
        // Close when clicking backdrop
        if (e.target === e.currentTarget) setSearchOpen(false);
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            borderBottom: '1px solid #334155',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            style={{ color: '#64748b', flexShrink: 0 }}
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search members and work items..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '14px 12px',
              fontSize: 15,
              color: '#f1f5f9',
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              fontSize: 11,
              color: '#475569',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 4,
              padding: '2px 6px',
              fontFamily: 'inherit',
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {orderedResults.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: '#475569',
                fontSize: 13,
              }}
            >
              No results for "{query}"
            </div>
          )}

          {memberResults.length > 0 && (
            <div>
              <div
                style={{
                  padding: '8px 14px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#475569',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Members
              </div>
              {memberResults.map((result, i) => {
                const flatIdx = i;
                const focused = focusedIndex === flatIdx;
                if (result.kind !== 'member') return null;
                const { member } = result;
                return (
                  <div
                    key={member.id}
                    data-idx={flatIdx}
                    onClick={() => selectResult(result)}
                    onMouseEnter={() => setFocusedIndex(flatIdx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: focused ? '#0f172a' : 'transparent',
                      borderLeft: focused ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {member.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {member.role}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {itemResults.length > 0 && (
            <div>
              <div
                style={{
                  padding: '8px 14px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#475569',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  borderTop: memberResults.length > 0 ? '1px solid #1e293b' : undefined,
                  marginTop: memberResults.length > 0 ? 4 : 0,
                }}
              >
                Work Items
              </div>
              {itemResults.map((result, i) => {
                const flatIdx = memberResults.length + i;
                const focused = focusedIndex === flatIdx;
                if (result.kind !== 'workitem') return null;
                const { item } = result;
                const typeColor = TYPE_COLORS[item.type] ?? '#64748b';
                const statusColor = STATUS_COLORS[item.status] ?? '#64748b';
                return (
                  <div
                    key={item.id}
                    data-idx={flatIdx}
                    onClick={() => selectResult(result)}
                    onMouseEnter={() => setFocusedIndex(flatIdx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: focused ? '#0f172a' : 'transparent',
                      borderLeft: focused ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: typeColor,
                            background: `${typeColor}22`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {item.type}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: statusColor,
                            background: `${statusColor}22`,
                            borderRadius: 4,
                            padding: '1px 5px',
                          }}
                        >
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Padding at bottom */}
          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
};
