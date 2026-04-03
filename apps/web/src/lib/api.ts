import type {
  OrgTree,
  OrgMember,
  WorkItem,
  BriefingSummary,
  WeeklyBriefing,
  CreateWorkItemBody,
  DelegateItemBody,
} from '@leaderflow/shared';

const BASE_URL = '/api';

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Org ──────────────────────────────────────────────────────────────────────

export async function fetchOrgTree(): Promise<{ org: { id: string; name: string }; tree: OrgTree }> {
  return request('/org');
}

export async function fetchMembers(): Promise<OrgMember[]> {
  return request('/org/members');
}

export async function createMember(data: {
  name: string;
  email: string;
  role: string;
  parentId?: string;
}): Promise<OrgMember> {
  return request('/org/members', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Work Items ───────────────────────────────────────────────────────────────

export interface ItemsFilter {
  type?: string;
  status?: string;
  toMemberId?: string;
  fromMemberId?: string;
}

export async function fetchItems(filter: ItemsFilter = {}): Promise<WorkItem[]> {
  const params = new URLSearchParams();
  if (filter.type) params.set('type', filter.type);
  if (filter.status) params.set('status', filter.status);
  if (filter.toMemberId) params.set('toMemberId', filter.toMemberId);
  if (filter.fromMemberId) params.set('fromMemberId', filter.fromMemberId);
  const qs = params.toString();
  return request(`/items${qs ? `?${qs}` : ''}`);
}

export async function fetchItem(id: string): Promise<WorkItem> {
  return request(`/items/${id}`);
}

export async function createItem(body: CreateWorkItemBody): Promise<WorkItem> {
  return request('/items', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createWorkItem(data: {
  title: string;
  type: string;
  priority: string;
  toMemberId: string;
  fromMemberId?: string;
  description?: string;
  dueAt?: string;
}): Promise<WorkItem> {
  return request('/items', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function delegateItem(id: string, body: DelegateItemBody): Promise<WorkItem> {
  return request(`/items/${id}/delegate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function acknowledgeItem(id: string): Promise<WorkItem> {
  return request(`/items/${id}/acknowledge`, { method: 'POST' });
}

export async function completeItem(id: string, note?: string): Promise<WorkItem> {
  return request(`/items/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

// ─── Briefing ─────────────────────────────────────────────────────────────────

export async function fetchBriefing(): Promise<BriefingSummary> {
  return request('/briefing');
}

export async function fetchWeeklyBriefing(): Promise<WeeklyBriefing> {
  return request('/briefing/weekly');
}

// ─── Automation ───────────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  type: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled: boolean;
  runCount: number;
  lastRunAt?: string | null;
  createdAt: string;
}

export async function fetchAutomationOpportunities(): Promise<WorkItem[]> {
  return request('/automation/opportunities');
}

export async function triggerAutomationAnalysis(): Promise<{ ok: boolean; message: string }> {
  return request('/automation/analyze', { method: 'POST' });
}

export async function fetchAutomationRules(): Promise<AutomationRule[]> {
  return request('/automation/rules');
}

export async function createAutomationRule(body: {
  name: string;
  description?: string;
  type: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
}): Promise<AutomationRule> {
  return request('/automation/rules', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateAutomationRule(
  id: string,
  body: { enabled?: boolean; name?: string; condition?: Record<string, unknown>; action?: Record<string, unknown> }
): Promise<AutomationRule> {
  return request(`/automation/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteAutomationRule(id: string): Promise<void> {
  return request(`/automation/rules/${id}`, { method: 'DELETE' });
}
