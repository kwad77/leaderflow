import React from 'react';
import type { OrgMember, WorkItem } from '@leaderflow/shared';
import { NODE_WIDTH, NODE_HEIGHT } from '../../hooks/useOrgLayout';

interface OrgNodeProps {
  member: OrgMember;
  x: number;
  y: number;
  items: WorkItem[];
  selected: boolean;
  onClick: (memberId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Generate a deterministic color from a string
function avatarColor(str: string): string {
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6',
    '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Workload badge color thresholds
function workloadColor(count: number, hasOverdue: boolean): string {
  if (hasOverdue || count >= 6) return '#ef4444';
  if (count >= 3) return '#f59e0b';
  return '#22c55e';
}

export const OrgNode: React.FC<OrgNodeProps> = ({
  member,
  x,
  y,
  items,
  selected,
  onClick,
}) => {
  const escalations = items.filter(
    (i) => i.type === 'ESCALATION' && !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );
  const delegations = items.filter(
    (i) => i.type === 'DELEGATION' && !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );
  const ingress = items.filter(
    (i) => i.type === 'INGRESS' && !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );

  // Workload: items assigned TO this member only
  const workloadItems = items.filter(
    (i) => i.toMemberId === member.id && !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );
  const workloadCount = workloadItems.length;
  const hasOverdue = workloadItems.some((i) => i.status === 'OVERDUE');
  const showWorkloadBadge = workloadCount > 0;

  const hasAtRisk = items.some((i) => ['AT_RISK', 'OVERDUE', 'STALE'].includes(i.status));

  const bgColor = selected ? '#1e40af' : '#1e293b';
  const borderColor = selected
    ? '#3b82f6'
    : hasAtRisk
    ? '#ef4444'
    : '#334155';
  const borderWidth = selected ? 2.5 : hasAtRisk ? 2 : 1.5;
  const avatarBg = avatarColor(member.id);

  const AVATAR_R = 20;
  const AVATAR_CX = x + NODE_WIDTH / 2;
  const AVATAR_CY = y + 22;

  // Workload badge: positioned at bottom-right of avatar circle (~45° angle)
  const BADGE_R = 8;
  const BADGE_CX = AVATAR_CX + Math.round(AVATAR_R * 0.707) + BADGE_R - 2;
  const BADGE_CY = AVATAR_CY + Math.round(AVATAR_R * 0.707) + BADGE_R - 2;
  const badgeColor = showWorkloadBadge ? workloadColor(workloadCount, hasOverdue) : '#475569';
  const badgeLabel = workloadCount >= 100 ? '99+' : String(workloadCount);
  // Tooltip text for the badge
  const overdueCount = workloadItems.filter((i) => i.status === 'OVERDUE').length;
  const tooltipText = hasOverdue
    ? `${overdueCount} overdue, ${workloadCount} active`
    : `${workloadCount} active item${workloadCount !== 1 ? 's' : ''}`;

  return (
    <g
      onClick={() => onClick(member.id)}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={`${member.name}, ${member.role}`}
    >
      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={12}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={borderWidth}
        opacity={0.97}
      />

      {/* Subtle glow for selected or at-risk */}
      {(selected || hasAtRisk) && (
        <rect
          x={x - 2}
          y={y - 2}
          width={NODE_WIDTH + 4}
          height={NODE_HEIGHT + 4}
          rx={14}
          fill="none"
          stroke={selected ? '#3b82f6' : '#ef4444'}
          strokeWidth={1}
          opacity={0.3}
        />
      )}

      {/* Avatar circle */}
      <circle cx={AVATAR_CX} cy={AVATAR_CY} r={AVATAR_R} fill={avatarBg} />
      <text
        x={AVATAR_CX}
        y={AVATAR_CY + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={11}
        fontWeight="600"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {getInitials(member.name)}
      </text>

      {/* Workload badge — bottom-right of avatar */}
      {showWorkloadBadge && (
        <g>
          {/* Pulse ring for overdue items */}
          {hasOverdue && (
            <circle cx={BADGE_CX} cy={BADGE_CY} r={BADGE_R} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0}>
              <animate attributeName="r" from={BADGE_R} to={BADGE_R + 5} dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur="1.4s" repeatCount="indefinite" />
            </circle>
          )}
          {/* Badge circle */}
          <circle
            cx={BADGE_CX}
            cy={BADGE_CY}
            r={BADGE_R}
            fill={badgeColor}
            stroke="#0f172a"
            strokeWidth={1.5}
          >
            <title>{tooltipText}</title>
          </circle>
          {/* Count text inside badge */}
          <text
            x={BADGE_CX}
            y={BADGE_CY + 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={7}
            fontWeight="700"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {badgeLabel}
          </text>
        </g>
      )}

      {/* Name */}
      <text
        x={x + NODE_WIDTH / 2}
        y={y + 50}
        textAnchor="middle"
        fill="#f1f5f9"
        fontSize={11}
        fontWeight="600"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {member.name.length > 16 ? member.name.slice(0, 15) + '…' : member.name}
      </text>

      {/* Role */}
      <text
        x={x + NODE_WIDTH / 2}
        y={y + 63}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={9}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {member.role.length > 20 ? member.role.slice(0, 19) + '…' : member.role}
      </text>

      {/* Badges — top-right corner */}
      {escalations.length > 0 && (
        <g transform={`translate(${x + NODE_WIDTH - 10}, ${y + 8})`}>
          <circle r={8} fill="#ef4444" />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={8}
            fontWeight="700"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {escalations.length}
          </text>
        </g>
      )}

      {delegations.length > 0 && (
        <g
          transform={`translate(${
            x + NODE_WIDTH - 10 - (escalations.length > 0 ? 18 : 0)
          }, ${y + 8})`}
        >
          <circle r={8} fill="#3b82f6" />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={8}
            fontWeight="700"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {delegations.length}
          </text>
        </g>
      )}

      {ingress.length > 0 && (
        <g
          transform={`translate(${
            x +
            NODE_WIDTH -
            10 -
            (escalations.length > 0 ? 18 : 0) -
            (delegations.length > 0 ? 18 : 0)
          }, ${y + 8})`}
        >
          <circle r={8} fill="#f97316" />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={8}
            fontWeight="700"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {ingress.length}
          </text>
        </g>
      )}
    </g>
  );
};
