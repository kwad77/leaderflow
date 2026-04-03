// ─── Enums ───────────────────────────────────────────────────────────────────

export type WorkItemType = 'INGRESS' | 'DELEGATION' | 'ESCALATION';

export type WorkItemStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'STALE'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'ARCHIVED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// ─── Core models ─────────────────────────────────────────────────────────────

export interface OrgMember {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  role: string;
  orgId: string;
  parentId?: string | null;
  createdAt: string;
}

export interface OrgTree extends OrgMember {
  directReports: OrgTree[];
}

export interface WorkItemUpdate {
  id: string;
  itemId: string;
  authorId?: string | null;
  note: string;
  statusChange?: string | null;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  title: string;
  description?: string | null;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: Priority;
  source?: string | null;
  sourceRef?: string | null;
  orgId: string;
  fromMemberId?: string | null;
  from?: OrgMember | null;
  fromExternal?: string | null;
  toMemberId: string;
  to?: OrgMember | null;
  dueAt?: string | null;
  acknowledgedAt?: string | null;
  completedAt?: string | null;
  aiSuggestedOwner?: string | null;
  aiSuggestedPriority?: string | null;
  aiRationale?: string | null;
  aiAutomatable: boolean;
  aiAutomationNotes?: string | null;
  updates: WorkItemUpdate[];
  tags: string[];
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Integration {
  id: string;
  orgId: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  lastSyncAt?: string | null;
  createdAt: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface BriefingSummary {
  ingress: WorkItem[];
  escalations: WorkItem[];
  atRisk: WorkItem[];
  totals: {
    ingress: number;
    escalations: number;
    atRisk: number;
    total: number;
  };
}

export interface WeeklyBriefing {
  period: { from: string; to: string };
  stats: { completedThisWeek: number; createdThisWeek: number; overdueNow: number };
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  triageSpeedMs: number | null;
  escalationResponseMs: number | null;
  completionByMember: Array<{ memberId: string; name: string; role: string; assigned: number; completed: number }>;
  delegationRatioByDay: Array<{ date: string; delegations: number; ingress: number }>;
}

export interface CreateWorkItemBody {
  title: string;
  description?: string;
  type: WorkItemType;
  priority: Priority;
  toMemberId: string;
  fromMemberId?: string;
  fromExternal?: string;
  dueAt?: string;
  tags?: string[];
}

export interface DelegateItemBody {
  toMemberId: string;
  note?: string;
}

// ─── WebSocket events ─────────────────────────────────────────────────────────

export type WSEventType =
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_DELEGATED'
  | 'ITEM_ACKNOWLEDGED'
  | 'ITEM_COMPLETED'
  | 'ORG_UPDATED';

export interface WSEvent {
  type: WSEventType;
  payload: WorkItem | OrgTree | { itemId: string };
  timestamp: string;
}

// ─── Org tree utilities ───────────────────────────────────────────────────────

export function findParent(tree: OrgTree, targetId: string): OrgTree | null {
  for (const child of tree.directReports) {
    if (child.id === targetId) return tree;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

export function getSubtreeIds(tree: OrgTree, rootMemberId: string): string[] {
  function collect(node: OrgTree): string[] {
    if (node.id === rootMemberId) {
      return getAllIds(node);
    }
    for (const child of node.directReports) {
      const found = collect(child);
      if (found.length > 0) return found;
    }
    return [];
  }
  function getAllIds(node: OrgTree): string[] {
    return [node.id, ...node.directReports.flatMap(getAllIds)];
  }
  return collect(tree);
}

// ─── Layout helpers (used by both useOrgLayout and potentially server) ────────

export interface NodePosition {
  x: number;
  y: number;
}

export interface OrgEdgeDef {
  id: string;
  sourceId: string;
  targetId: string;
  items: WorkItem[];
}
