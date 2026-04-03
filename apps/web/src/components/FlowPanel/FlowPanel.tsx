import React, { useRef, useState, useEffect } from 'react';
import { FilterCard } from './FilterCard';
import { WorkItemRow } from './WorkItemRow';
import { useAppStore } from '../../stores/appStore';
import { useWorkItems } from '../../hooks/useWorkItems';
import { CreateItemModal } from '../CreateItem';
import { bulkUpdateItems } from '../../lib/api';
import type { WorkItem, OrgTree, OrgMember } from '@leaderflow/shared';

function flattenTree(tree: OrgTree): OrgMember[] {
  const { directReports, ...member } = tree;
  const result: OrgMember[] = [member];
  for (const child of directReports) {
    result.push(...flattenTree(child));
  }
  return result;
}

export const FlowPanel: React.FC = () => {
  const {
    briefing,
    items: allItems,
    activeFilter,
    filterPanelOpen,
    openFilter,
    closeFilter,
    currentUserRole,
    currentUser,
    orgTree,
    setItems,
  } = useAppStore();

  // Role-based item filtering
  const items = React.useMemo(() => {
    if (currentUserRole !== 'member' || !currentUser) return allItems;
    return allItems.filter(
      (i) => i.toMemberId === currentUser.id || i.fromMemberId === currentUser.id
    );
  }, [allItems, currentUserRole, currentUser]);
  const { refresh } = useWorkItems();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Mobile height: use 60% of viewport height on narrow screens
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTarget, setDelegateTarget] = useState<string>('');

  const orgMembers = React.useMemo(
    () => (orgTree ? flattenTree(orgTree) : []),
    [orgTree]
  );

  const handleSelect = (id: string, sel: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      sel ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean, currentFilteredItems: WorkItem[]) => {
    if (checked) {
      setSelectedIds(new Set(currentFilteredItems.map((i) => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setDelegateOpen(false);
    setDelegateTarget('');
  };

  const handleBulkAction = async (action: 'acknowledge' | 'complete' | 'archive' | 'delegate', toMemberId?: string) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setDelegateOpen(false);
    try {
      const result = await bulkUpdateItems({
        itemIds: [...selectedIds],
        action,
        toMemberId,
      });
      const affected = new Set(result.itemIds);
      if (action === 'complete' || action === 'archive') {
        setItems(allItems.filter((i) => !affected.has(i.id)));
      } else if (action === 'acknowledge') {
        setItems(allItems.map((i) => affected.has(i.id) ? { ...i, status: 'ACKNOWLEDGED' as const } : i));
      } else if (action === 'delegate' && toMemberId) {
        setItems(allItems.map((i) => affected.has(i.id) ? { ...i, toMemberId } : i));
      }
      const n = result.updated;
      setBulkSuccess(`✓ ${n} item${n !== 1 ? 's' : ''} updated`);
      clearSelection();
      setTimeout(() => setBulkSuccess(null), 1500);
    } catch (err) {
      console.error('Bulk action failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleFilterClick = (filter: 'ingress' | 'escalations' | 'atRisk') => {
    if (activeFilter === filter && filterPanelOpen) {
      closeFilter();
    } else {
      openFilter(filter);
    }
  };

  const getFilteredItems = (): WorkItem[] => {
    if (!activeFilter) return [];
    switch (activeFilter) {
      case 'ingress':
        return items.filter(
          (i) => i.type === 'INGRESS' && !['COMPLETED', 'ARCHIVED'].includes(i.status)
        );
      case 'escalations':
        return items.filter(
          (i) => i.type === 'ESCALATION' && !['COMPLETED', 'ARCHIVED'].includes(i.status)
        );
      case 'atRisk':
        return items.filter((i) => ['AT_RISK', 'OVERDUE', 'STALE'].includes(i.status));
      default:
        return [];
    }
  };

  const filteredItems = getFilteredItems().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const ingressCount = briefing?.totals.ingress ?? 0;
  const escalationsCount = briefing?.totals.escalations ?? 0;
  const atRiskCount = briefing?.totals.atRisk ?? 0;

  const PANEL_HEIGHT = filterPanelOpen
    ? isMobile
      ? Math.round(viewportHeight * 0.6)
      : 320
    : 0;
  const BOTTOM_BAR_HEIGHT = 148;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      {/* Expandable sheet */}
      <div
        ref={sheetRef}
        style={{
          height: PANEL_HEIGHT,
          overflow: 'hidden',
          transition: 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          background: '#0f172a',
          borderTop: '1px solid #1e293b',
        }}
      >
        {filterPanelOpen && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Sheet header */}
            <div
              style={{
                padding: '10px 16px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #1e293b',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Select-all checkbox */}
                {filteredItems.length > 0 && (
                  <div
                    onClick={() => handleSelectAll(selectedIds.size !== filteredItems.length, filteredItems)}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: `1px solid ${selectedIds.size > 0 ? '#3b82f6' : '#334155'}`,
                      background: selectedIds.size === filteredItems.length && filteredItems.length > 0
                        ? '#3b82f6'
                        : selectedIds.size > 0
                          ? '#3b82f633'
                          : '#1e293b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    role="checkbox"
                    aria-checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    aria-label="Select all"
                    title="Select all"
                  >
                    {selectedIds.size === filteredItems.length && filteredItems.length > 0 && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {selectedIds.size > 0 && selectedIds.size < filteredItems.length && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <line x1="2" y1="5" x2="8" y2="5" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {activeFilter === 'ingress' && 'Ingress Items'}
                  {activeFilter === 'escalations' && 'Escalations'}
                  {activeFilter === 'atRisk' && 'At Risk'}
                  {' '}
                  <span style={{ color: '#64748b' }}>({filteredItems.length})</span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  style={{
                    width: 28,
                    height: 28,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#94a3b8',
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Create work item"
                  title="Create work item"
                >
                  +
                </button>
                <button
                  onClick={closeFilter}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: 18,
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: '0 4px',
                  }}
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Bulk action toolbar */}
            {(selectedIds.size > 0 || bulkSuccess) && (
              <div
                style={{
                  background: '#1e293b',
                  borderBottom: '1px solid #334155',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                  flexWrap: 'wrap',
                }}
              >
                {bulkSuccess ? (
                  <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>{bulkSuccess}</span>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>
                      {selectedIds.size} selected
                    </span>
                    <BulkButton label="Acknowledge" disabled={bulkLoading} onClick={() => handleBulkAction('acknowledge')} />
                    <BulkButton label="Complete" disabled={bulkLoading} onClick={() => handleBulkAction('complete')} />
                    <BulkButton label="Archive" disabled={bulkLoading} onClick={() => handleBulkAction('archive')} />
                    <div style={{ position: 'relative' }}>
                      <BulkButton
                        label="Delegate ▾"
                        disabled={bulkLoading}
                        onClick={() => setDelegateOpen((o) => !o)}
                      />
                      {delegateOpen && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: 0,
                            marginBottom: 4,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 6,
                            overflow: 'hidden',
                            minWidth: 160,
                            zIndex: 200,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                          }}
                        >
                          {orgMembers.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: 12, color: '#64748b' }}>No members found</div>
                          ) : (
                            orgMembers.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleBulkAction('delegate', m.id)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '7px 12px',
                                  background: delegateTarget === m.id ? '#0f172a' : 'transparent',
                                  border: 'none',
                                  color: '#cbd5e1',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#0f172a'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = delegateTarget === m.id ? '#0f172a' : 'transparent'; }}
                              >
                                {m.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <BulkButton label="✕ Clear" disabled={bulkLoading} onClick={clearSelection} />
                  </>
                )}
              </div>
            )}

            {/* Item list */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px 12px',
              }}
            >
              {filteredItems.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
                  <div>No items match this filter.</div>
                  {items.length === 0 && (
                    <div style={{ marginTop: 4, fontSize: 12 }}>Your queue is clear.</div>
                  )}
                </div>
              ) : (
                filteredItems.map((item) => (
                  <WorkItemRow
                    key={item.id}
                    item={item}
                    onAction={refresh}
                    selected={selectedIds.has(item.id)}
                    onSelect={handleSelect}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar with 3 filter cards */}
      <div
        style={{
          height: BOTTOM_BAR_HEIGHT,
          background: '#0f172a',
          borderTop: '1px solid #1e293b',
          padding: '12px 12px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Filter cards + create button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <FilterCard
            type="ingress"
            count={ingressCount}
            active={activeFilter === 'ingress'}
            onClick={() => handleFilterClick('ingress')}
          />
          <FilterCard
            type="escalations"
            count={escalationsCount}
            active={activeFilter === 'escalations'}
            onClick={() => handleFilterClick('escalations')}
          />
          <FilterCard
            type="atRisk"
            count={atRiskCount}
            active={activeFilter === 'atRisk'}
            onClick={() => handleFilterClick('atRisk')}
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              alignSelf: 'center',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Create work item"
            title="Create work item"
          >
            +
          </button>
        </div>

        {/* Swipe indicator */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: '#1e293b',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Create item modal */}
      {showCreate && <CreateItemModal onClose={() => setShowCreate(false)} />}
    </div>
  );
};

const BulkButton: React.FC<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, disabled, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    style={{
      padding: '4px 10px',
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 4,
      color: disabled ? '#475569' : '#94a3b8',
      fontSize: 11,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      whiteSpace: 'nowrap',
    }}
    onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#1e293b'; }}
    onMouseLeave={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#0f172a'; }}
  >
    {label}
  </button>
);
