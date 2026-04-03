import React, { useRef, useState } from 'react';
import { FilterCard } from './FilterCard';
import { WorkItemRow } from './WorkItemRow';
import { useAppStore } from '../../stores/appStore';
import { useWorkItems } from '../../hooks/useWorkItems';
import { CreateItemModal } from '../CreateItem';
import type { WorkItem } from '@leaderflow/shared';

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

  const PANEL_HEIGHT = filterPanelOpen ? 320 : 0;
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
                  <WorkItemRow key={item.id} item={item} onAction={refresh} />
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
