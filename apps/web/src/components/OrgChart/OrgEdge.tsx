import React from 'react';
import { Particle } from './Particle';
import type { OrgEdgeDef, NodePosition, WorkItem } from '@leaderflow/shared';
import { NODE_WIDTH, NODE_HEIGHT } from '../../hooks/useOrgLayout';

interface OrgEdgeProps {
  edge: OrgEdgeDef;
  sourcePos: NodePosition;
  targetPos: NodePosition;
}

function cubicBezierPath(
  x1: number, y1: number,
  x2: number, y2: number
): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export const OrgEdge: React.FC<OrgEdgeProps> = ({ edge, sourcePos, targetPos }) => {
  const startX = sourcePos.x + NODE_WIDTH / 2;
  const startY = sourcePos.y + NODE_HEIGHT;
  const endX = targetPos.x + NODE_WIDTH / 2;
  const endY = targetPos.y;

  const pathData = cubicBezierPath(startX, startY, endX, endY);
  const pathId = `edge-${edge.id.replace(/[^a-zA-Z0-9]/g, '-')}`;

  // Group items by type for particle rendering
  const escalations = edge.items.filter((i: WorkItem) => i.type === 'ESCALATION');
  const delegations = edge.items.filter((i: WorkItem) => i.type === 'DELEGATION');
  const ingress = edge.items.filter((i: WorkItem) => i.type === 'INGRESS');

  const hasParticles = edge.items.length > 0;

  return (
    <g>
      {/* Define path for particle motion */}
      <defs>
        <path id={pathId} d={pathData} />
      </defs>

      {/* Edge line */}
      <path
        d={pathData}
        fill="none"
        stroke={hasParticles ? '#334155' : '#1e293b'}
        strokeWidth={hasParticles ? 2 : 1.5}
        opacity={hasParticles ? 0.8 : 0.4}
      />

      {/* Escalation particles (go upward — reverse direction) */}
      {escalations.map((item: WorkItem, i: number) => (
        <Particle
          key={`esc-${item.id}`}
          pathId={pathId}
          type="ESCALATION"
          index={i}
          duration={2.5}
          reverse={true}
        />
      ))}

      {/* Delegation particles (go downward) */}
      {delegations.map((item: WorkItem, i: number) => (
        <Particle
          key={`del-${item.id}`}
          pathId={pathId}
          type="DELEGATION"
          index={i}
          duration={3}
          reverse={false}
        />
      ))}

      {/* Ingress particles */}
      {ingress.map((item: WorkItem, i: number) => (
        <Particle
          key={`ing-${item.id}`}
          pathId={pathId}
          type="INGRESS"
          index={i}
          duration={2}
          reverse={false}
        />
      ))}
    </g>
  );
};
