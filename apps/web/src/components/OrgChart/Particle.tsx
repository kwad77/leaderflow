import React from 'react';
import type { WorkItemType } from '@leaderflow/shared';

interface ParticleProps {
  pathId: string;
  type: WorkItemType;
  index: number;
  duration: number;
  /** For ESCALATION (upward), reverse the path direction */
  reverse?: boolean;
}

const TYPE_COLORS: Record<WorkItemType, string> = {
  ESCALATION: '#ef4444',
  DELEGATION: '#3b82f6',
  INGRESS: '#f97316',
};

const TYPE_GLOW: Record<WorkItemType, string> = {
  ESCALATION: 'rgba(239,68,68,0.5)',
  DELEGATION: 'rgba(59,130,246,0.5)',
  INGRESS: 'rgba(249,115,22,0.5)',
};

export const Particle: React.FC<ParticleProps> = ({
  pathId,
  type,
  index,
  duration,
  reverse = false,
}) => {
  const color = TYPE_COLORS[type];
  const glow = TYPE_GLOW[type];
  // Stagger particles along the path
  const begin = `-${(index / 3) * duration}s`;

  return (
    <g>
      <circle r="5" fill={color} opacity="0.9">
        <animateMotion
          dur={`${duration}s`}
          repeatCount="indefinite"
          begin={begin}
          calcMode="linear"
          keyPoints={reverse ? '1;0' : '0;1'}
          keyTimes="0;1"
        >
          <mpath href={`#${pathId}`} />
        </animateMotion>
      </circle>
      {/* Glow halo */}
      <circle r="8" fill={glow} opacity="0.4">
        <animateMotion
          dur={`${duration}s`}
          repeatCount="indefinite"
          begin={begin}
          calcMode="linear"
          keyPoints={reverse ? '1;0' : '0;1'}
          keyTimes="0;1"
        >
          <mpath href={`#${pathId}`} />
        </animateMotion>
      </circle>
    </g>
  );
};
