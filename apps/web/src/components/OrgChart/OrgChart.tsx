import React, { useRef, useState, useCallback, useEffect } from 'react';
import { OrgNode } from './OrgNode';
import { OrgEdge } from './OrgEdge';
import { useOrgLayout } from '../../hooks/useOrgLayout';
import { useAppStore } from '../../stores/appStore';
import type { OrgTree, OrgMember, WorkItem } from '@leaderflow/shared';
import { findParent } from '@leaderflow/shared';

interface OrgChartProps {
  root: OrgTree;
  items: WorkItem[];
}

function flattenTree(node: OrgTree): OrgMember[] {
  return [node, ...node.directReports.flatMap(flattenTree)];
}

// Build a map of memberId -> depth (root = 0)
function buildDepthMap(node: OrgTree, depth: number, map: Map<string, number>): void {
  map.set(node.id, depth);
  for (const child of node.directReports) {
    buildDepthMap(child, depth + 1, map);
  }
}

// For a given node at the depth cutoff, count hidden children subtree members
function countHiddenChildren(node: OrgTree): number {
  return node.directReports.length;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export const OrgChart: React.FC<OrgChartProps> = ({ root, items }) => {
  const { positions, edges, totalWidth, totalHeight } = useOrgLayout(root, items);
  const {
    selectedMemberId, setSelectedMember, openTriage, currentUserRole, currentUser,
    orgDepth, setOrgDepth,
  } = useAppStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const allMembers = flattenTree(root);

  // Build depth map for all members
  const depthMap = React.useMemo(() => {
    const map = new Map<string, number>();
    buildDepthMap(root, 0, map);
    return map;
  }, [root]);

  // Nodes at the depth boundary (depth === orgDepth - 1) that have hidden children
  const expandHints = React.useMemo(() => {
    const hints: Array<{ memberId: string; hiddenCount: number }> = [];
    function traverse(node: OrgTree, depth: number) {
      if (depth === orgDepth - 1 && node.directReports.length > 0) {
        hints.push({ memberId: node.id, hiddenCount: countHiddenChildren(node) });
      } else if (depth < orgDepth - 1) {
        for (const child of node.directReports) {
          traverse(child, depth + 1);
        }
      }
    }
    traverse(root, 0);
    return hints;
  }, [root, orgDepth]);

  // Role-based tree filtering: members only see themselves + direct parent
  const visibleMemberIds: Set<string> | null = React.useMemo(() => {
    if (currentUserRole !== 'member' || !currentUser) return null;
    const ids = new Set<string>([currentUser.id]);
    const parent = findParent(root, currentUser.id);
    if (parent) ids.add(parent.id);
    return ids;
  }, [currentUserRole, currentUser, root]);

  // Center on first render
  useEffect(() => {
    if (svgRef.current && totalWidth > 0) {
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = rect.width / totalWidth;
      const scaleY = rect.height / (totalHeight + 120); // leave room for bottom panel
      const scale = Math.min(scaleX, scaleY, 1.2);
      const x = (rect.width - totalWidth * scale) / 2;
      const y = 20;
      setTransform({ x, y, scale });
    }
  }, [totalWidth, totalHeight]);

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.3, Math.min(2.5, t.scale + delta * t.scale)),
    }));
  }, []);

  // Pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    }
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    setTransform((t) => ({
      ...t,
      x: panStart.current!.tx + (e.clientX - panStart.current!.x),
      y: panStart.current!.ty + (e.clientY - panStart.current!.y),
    }));
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  const handleNodeClick = useCallback((memberId: string) => {
    setSelectedMember(selectedMemberId === memberId ? null : memberId);
  }, [selectedMemberId, setSelectedMember]);

  const activeItems = items.filter(
    (i) => !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        bottom: '160px', // leave room for flow panel
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at center, #0f1f3d 0%, #0f172a 70%)',
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', display: 'block' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Background grid dots */}
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="0.8" fill="#1e293b" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Edges (rendered below nodes) — gated by orgDepth */}
          {edges.map((edge) => {
            const sourceDepth = depthMap.get(edge.sourceId) ?? 0;
            const targetDepth = depthMap.get(edge.targetId) ?? 0;
            // Hide edge if either endpoint is beyond visible depth
            if (sourceDepth >= orgDepth || targetDepth >= orgDepth) return null;
            const sourcePos = positions.get(edge.sourceId);
            const targetPos = positions.get(edge.targetId);
            if (!sourcePos || !targetPos) return null;
            return (
              <OrgEdge
                key={edge.id}
                edge={edge}
                sourcePos={sourcePos}
                targetPos={targetPos}
              />
            );
          })}

          {/* Nodes — gated by orgDepth */}
          {allMembers.map((member) => {
            if (visibleMemberIds && !visibleMemberIds.has(member.id)) return null;
            const memberDepth = depthMap.get(member.id) ?? 0;
            if (memberDepth >= orgDepth) return null;
            const pos = positions.get(member.id);
            if (!pos) return null;
            const memberItems = activeItems.filter(
              (i) => i.toMemberId === member.id || i.fromMemberId === member.id
            );
            return (
              <OrgNode
                key={member.id}
                member={member}
                x={pos.x}
                y={pos.y}
                items={memberItems}
                selected={selectedMemberId === member.id}
                onClick={handleNodeClick}
              />
            );
          })}

          {/* Expand hints — shown below nodes at the depth boundary */}
          {expandHints.map(({ memberId, hiddenCount }) => {
            if (visibleMemberIds && !visibleMemberIds.has(memberId)) return null;
            const pos = positions.get(memberId);
            if (!pos) return null;
            // Position the pill centered below the node
            const hintX = pos.x + 80; // NODE_WIDTH / 2
            const hintY = pos.y + 80 + 18; // NODE_HEIGHT + spacing
            const pillW = 64;
            const pillH = 20;
            return (
              <g
                key={`hint-${memberId}`}
                onClick={() => setOrgDepth(orgDepth + 1)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={`Show ${hiddenCount} more levels`}
              >
                <rect
                  x={hintX - pillW / 2}
                  y={hintY - pillH / 2}
                  width={pillW}
                  height={pillH}
                  rx={10}
                  fill="#1e293b"
                  stroke="#334155"
                  strokeWidth={1}
                />
                <text
                  x={hintX}
                  y={hintY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#64748b"
                  fontSize={10}
                  fontWeight="600"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  +{hiddenCount} more
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {[
          { label: '+', action: () => setTransform((t) => ({ ...t, scale: Math.min(2.5, t.scale * 1.2) })) },
          { label: '−', action: () => setTransform((t) => ({ ...t, scale: Math.max(0.3, t.scale / 1.2) })) },
          { label: '⊙', action: () => {
            if (svgRef.current) {
              const rect = svgRef.current.getBoundingClientRect();
              const scale = Math.min(rect.width / totalWidth, rect.height / (totalHeight + 120), 1.2);
              setTransform({ x: (rect.width - totalWidth * scale) / 2, y: 20, scale });
            }
          }},
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              width: 32,
              height: 32,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* New item FAB */}
      <button
        onClick={() => openTriage()}
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          border: 'none',
          color: 'white',
          fontSize: 24,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Create new work item"
      >
        +
      </button>
    </div>
  );
};
