import React, { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { OrgTree } from '@leaderflow/shared';

function computeMaxDepth(node: OrgTree, current = 0): number {
  if (node.directReports.length === 0) return current;
  return Math.max(...node.directReports.map((c) => computeMaxDepth(c, current + 1)));
}

export const SettingsPanel: React.FC = () => {
  const { orgDepth, setOrgDepth, setSettingsOpen, orgTree } = useAppStore();

  const maxDepth = useMemo(() => {
    if (!orgTree) return 6;
    return computeMaxDepth(orgTree) + 1; // +1 to convert 0-indexed depth to level count
  }, [orgTree]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        background: '#0f172a',
        borderLeft: '1px solid #1e293b',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 12px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#f1f5f9',
            letterSpacing: '-0.01em',
          }}
        >
          Settings
        </span>
        <button
          onClick={() => setSettingsOpen(false)}
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#94a3b8',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Org Chart section */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Org Chart
          </div>

          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 12,
                color: '#94a3b8',
                marginBottom: 8,
                fontWeight: 500,
              }}
            >
              Visible depth
            </div>

            {/* Segmented control */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                background: '#1e293b',
                borderRadius: 8,
                padding: 4,
                border: '1px solid #334155',
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <button
                  key={level}
                  onClick={() => setOrgDepth(level)}
                  style={{
                    flex: 1,
                    height: 32,
                    background: orgDepth === level ? '#3b82f6' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    color: orgDepth === level ? '#ffffff' : '#64748b',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  aria-label={`Show ${level} level${level !== 1 ? 's' : ''}`}
                  aria-pressed={orgDepth === level}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Status line */}
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: '#475569',
              }}
            >
              Showing {Math.min(orgDepth, maxDepth)} of {maxDepth} level{maxDepth !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Display section — placeholder */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Display
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#334155',
              fontStyle: 'italic',
            }}
          >
            More display options coming soon.
          </div>
        </div>

      </div>
    </div>
  );
};
