import React from 'react';
import type { FilterPanel } from '../../stores/appStore';

interface FilterCardProps {
  type: Exclude<FilterPanel, null>;
  count: number;
  active: boolean;
  onClick: () => void;
}

const CONFIG: Record<Exclude<FilterPanel, null>, { label: string; color: string; icon: string }> = {
  ingress: {
    label: 'Ingress',
    color: '#f97316',
    icon: '↓',
  },
  escalations: {
    label: 'Escalations',
    color: '#ef4444',
    icon: '↑',
  },
  atRisk: {
    label: 'At Risk',
    color: '#eab308',
    icon: '⚠',
  },
};

export const FilterCard: React.FC<FilterCardProps> = ({ type, count, active, onClick }) => {
  const { label, color, icon } = CONFIG[type];

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        background: active ? `${color}22` : '#1e293b',
        border: `1.5px solid ${active ? color : '#334155'}`,
        borderRadius: 10,
        padding: '10px 8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 14, color }}>{icon}</span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: active ? color : '#f1f5f9',
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: active ? color : '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      {count > 0 && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            marginTop: 2,
            animation: 'pulse 2s infinite',
          }}
        />
      )}
    </button>
  );
};
