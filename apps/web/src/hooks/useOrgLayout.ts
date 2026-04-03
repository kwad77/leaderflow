import { useMemo } from 'react';
import type { OrgTree, NodePosition, OrgEdgeDef, WorkItem } from '@leaderflow/shared';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const H_GAP = 40;
const V_GAP = 100;

interface LayoutResult {
  positions: Map<string, NodePosition>;
  edges: OrgEdgeDef[];
  totalWidth: number;
  totalHeight: number;
}

/**
 * Compute hierarchical layout positions using bottom-up subtree width calculation.
 * Root at top, children spread below.
 */
function computeSubtreeWidth(node: OrgTree): number {
  if (node.directReports.length === 0) {
    return NODE_WIDTH;
  }
  const childrenWidth = node.directReports.reduce(
    (sum, child) => sum + computeSubtreeWidth(child),
    0
  );
  const gapsWidth = (node.directReports.length - 1) * H_GAP;
  return Math.max(NODE_WIDTH, childrenWidth + gapsWidth);
}

function assignPositions(
  node: OrgTree,
  x: number,
  y: number,
  positions: Map<string, NodePosition>
): void {
  // Center this node over its subtree
  const myX = x + computeSubtreeWidth(node) / 2 - NODE_WIDTH / 2;
  positions.set(node.id, { x: myX, y });

  let childX = x;
  for (const child of node.directReports) {
    assignPositions(child, childX, y + NODE_HEIGHT + V_GAP, positions);
    childX += computeSubtreeWidth(child) + H_GAP;
  }
}

function buildEdges(node: OrgTree, items: WorkItem[], edges: OrgEdgeDef[]): void {
  for (const child of node.directReports) {
    const edgeItems = items.filter(
      (item) =>
        !['COMPLETED', 'ARCHIVED'].includes(item.status) &&
        ((item.fromMemberId === node.id && item.toMemberId === child.id) ||
          (item.fromMemberId === child.id && item.toMemberId === node.id))
    );

    edges.push({
      id: `${node.id}--${child.id}`,
      sourceId: node.id,
      targetId: child.id,
      items: edgeItems,
    });

    buildEdges(child, items, edges);
  }
}

export function useOrgLayout(root: OrgTree | null, items: WorkItem[]): LayoutResult {
  return useMemo(() => {
    if (!root) {
      return { positions: new Map(), edges: [], totalWidth: 0, totalHeight: 0 };
    }

    const positions = new Map<string, NodePosition>();
    const PADDING = 40;
    assignPositions(root, PADDING, PADDING, positions);

    const edges: OrgEdgeDef[] = [];
    buildEdges(root, items, edges);

    // Calculate total bounds
    let maxX = 0;
    let maxY = 0;
    for (const pos of positions.values()) {
      maxX = Math.max(maxX, pos.x + NODE_WIDTH);
      maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
    }

    return {
      positions,
      edges,
      totalWidth: maxX + PADDING,
      totalHeight: maxY + PADDING,
    };
  }, [root, items]);
}

export { NODE_WIDTH, NODE_HEIGHT };
