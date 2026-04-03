import type { OrgTree, OrgMember, WorkItem, BriefingSummary, WeeklyBriefing } from '@leaderflow/shared';

// ─── Org ──────────────────────────────────────────────────────────────────────

export const MOCK_ORG = { id: 'org-acme', name: 'Acme Corp' };

// ─── Members (as plain OrgMember objects) ─────────────────────────────────────

const NOW = Date.now();

function ago(hours: number): string {
  return new Date(NOW - hours * 3600_000).toISOString();
}

const SARAH: OrgMember = {
  id: 'mbr-sarah',
  name: 'Sarah Chen',
  email: 'sarah.chen@acme.com',
  role: 'CEO',
  orgId: 'org-acme',
  parentId: null,
  createdAt: ago(24 * 90),
};

const MARCUS: OrgMember = {
  id: 'mbr-marcus',
  name: 'Marcus Thompson',
  email: 'marcus.thompson@acme.com',
  role: 'VP Engineering',
  orgId: 'org-acme',
  parentId: 'mbr-sarah',
  createdAt: ago(24 * 60),
};

const ALEX: OrgMember = {
  id: 'mbr-alex',
  name: 'Alex Rivera',
  email: 'alex.rivera@acme.com',
  role: 'Senior Engineer',
  orgId: 'org-acme',
  parentId: 'mbr-marcus',
  createdAt: ago(24 * 45),
};

const JAMIE: OrgMember = {
  id: 'mbr-jamie',
  name: 'Jamie Kim',
  email: 'jamie.kim@acme.com',
  role: 'Engineer',
  orgId: 'org-acme',
  parentId: 'mbr-marcus',
  createdAt: ago(24 * 30),
};

const PRIYA: OrgMember = {
  id: 'mbr-priya',
  name: 'Priya Patel',
  email: 'priya.patel@acme.com',
  role: 'VP Product',
  orgId: 'org-acme',
  parentId: 'mbr-sarah',
  createdAt: ago(24 * 55),
};

const DAVID: OrgMember = {
  id: 'mbr-david',
  name: 'David Park',
  email: 'david.park@acme.com',
  role: 'Product Manager',
  orgId: 'org-acme',
  parentId: 'mbr-priya',
  createdAt: ago(24 * 40),
};

const EMMA: OrgMember = {
  id: 'mbr-emma',
  name: 'Emma Walsh',
  email: 'emma.walsh@acme.com',
  role: 'Product Designer',
  orgId: 'org-acme',
  parentId: 'mbr-priya',
  createdAt: ago(24 * 35),
};

// ─── Org Tree ─────────────────────────────────────────────────────────────────

export const MOCK_ORG_TREE: OrgTree = {
  ...SARAH,
  directReports: [
    {
      ...MARCUS,
      directReports: [
        { ...ALEX, directReports: [] },
        { ...JAMIE, directReports: [] },
      ],
    },
    {
      ...PRIYA,
      directReports: [
        { ...DAVID, directReports: [] },
        { ...EMMA, directReports: [] },
      ],
    },
  ],
};

// ─── Work Items ───────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  partial: Partial<WorkItem> & {
    title: string;
    type: WorkItem['type'];
    status: WorkItem['status'];
    priority: WorkItem['priority'];
    fromMemberId: string | null;
    toMemberId: string;
    from: OrgMember | null;
    to: OrgMember;
    createdAt: string;
  }
): WorkItem {
  return {
    id,
    orgId: 'org-acme',
    description: null,
    source: null,
    sourceRef: null,
    fromExternal: null,
    dueAt: null,
    acknowledgedAt: null,
    completedAt: null,
    aiSuggestedOwner: null,
    aiSuggestedPriority: null,
    aiRationale: null,
    aiAutomatable: false,
    aiAutomationNotes: null,
    updates: [],
    tags: [],
    metadata: null,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

// 3 INGRESS items for Sarah (PENDING, orange particles)
const ingress1 = makeItem('wi-ing-1', {
  title: 'Board request: Q2 budget reforecast',
  type: 'INGRESS',
  status: 'PENDING',
  priority: 'HIGH',
  fromMemberId: null,
  fromExternal: 'board@acme.com',
  toMemberId: 'mbr-sarah',
  from: null,
  to: SARAH,
  createdAt: ago(3),
  description: 'Board is requesting an updated Q2 budget model by Friday.',
});

const ingress2 = makeItem('wi-ing-2', {
  title: 'Investor: follow-up on Series B terms',
  type: 'INGRESS',
  status: 'PENDING',
  priority: 'URGENT',
  fromMemberId: null,
  fromExternal: 'investor@capitalfund.com',
  toMemberId: 'mbr-sarah',
  from: null,
  to: SARAH,
  createdAt: ago(7),
  description: 'Follow-up from investors regarding Series B term sheet clarifications.',
});

const ingress3 = makeItem('wi-ing-3', {
  title: 'Partnership inquiry: TechCorp integration',
  type: 'INGRESS',
  status: 'PENDING',
  priority: 'MEDIUM',
  fromMemberId: null,
  fromExternal: 'partnerships@techcorp.io',
  toMemberId: 'mbr-sarah',
  from: null,
  to: SARAH,
  createdAt: ago(18),
  description: 'TechCorp interested in API integration partnership.',
});

// 2 ESCALATION items (red, upward particles)
const escalation1 = makeItem('wi-esc-1', {
  title: 'CI pipeline blocked — 3 engineers idle',
  type: 'ESCALATION',
  status: 'PENDING',
  priority: 'URGENT',
  fromMemberId: 'mbr-alex',
  toMemberId: 'mbr-marcus',
  from: ALEX,
  to: MARCUS,
  createdAt: ago(6),
  description: 'Main CI pipeline has been broken for 6 hours. Multiple engineers blocked.',
});

const escalation2 = makeItem('wi-esc-2', {
  title: 'Infra costs 40% over Q2 budget',
  type: 'ESCALATION',
  status: 'PENDING',
  priority: 'HIGH',
  fromMemberId: 'mbr-marcus',
  toMemberId: 'mbr-sarah',
  from: MARCUS,
  to: SARAH,
  createdAt: ago(2.5 * 24 + 3),
  description: 'Cloud infra costs have exceeded Q2 budget by 40%. Need immediate sign-off on cost cuts.',
});

// 3 DELEGATION items (blue, downward particles)
const delegation1 = makeItem('wi-del-1', {
  title: 'Prepare eng capacity plan for board deck',
  type: 'DELEGATION',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  fromMemberId: 'mbr-sarah',
  toMemberId: 'mbr-marcus',
  from: SARAH,
  to: MARCUS,
  createdAt: ago(48),
  description: 'Sarah needs Marcus to prepare an engineering capacity slide for the board deck.',
  dueAt: new Date(NOW + 2 * 86400_000).toISOString(),
});

const delegation2 = makeItem('wi-del-2', {
  title: 'Roadmap prioritization for H2',
  type: 'DELEGATION',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  fromMemberId: 'mbr-sarah',
  toMemberId: 'mbr-priya',
  from: SARAH,
  to: PRIYA,
  createdAt: ago(36),
  description: 'Priya to lead H2 roadmap prioritization workshop with the product team.',
  dueAt: new Date(NOW + 5 * 86400_000).toISOString(),
});

const delegation3 = makeItem('wi-del-3', {
  title: 'Fix flaky integration tests in auth service',
  type: 'DELEGATION',
  status: 'PENDING',
  priority: 'MEDIUM',
  fromMemberId: 'mbr-marcus',
  toMemberId: 'mbr-alex',
  from: MARCUS,
  to: ALEX,
  createdAt: ago(12),
  description: 'Auth service tests are flaky and causing false CI failures. Alex to investigate and fix.',
});

// 1 AT_RISK item assigned to David Park
const atRisk1 = makeItem('wi-atr-1', {
  title: 'User research synthesis — mobile checkout',
  type: 'DELEGATION',
  status: 'AT_RISK',
  priority: 'HIGH',
  fromMemberId: 'mbr-priya',
  toMemberId: 'mbr-david',
  from: PRIYA,
  to: DAVID,
  createdAt: ago(5 * 24),
  dueAt: new Date(NOW - 86400_000).toISOString(), // yesterday
  description: 'David needs to synthesize user research from mobile checkout study. Overdue.',
});

// 1 STALE item assigned to Jamie Kim
const staleItem = makeItem('wi-stl-1', {
  title: 'Migrate legacy auth module to OAuth2',
  type: 'DELEGATION',
  status: 'STALE',
  priority: 'MEDIUM',
  fromMemberId: 'mbr-marcus',
  toMemberId: 'mbr-jamie',
  from: MARCUS,
  to: JAMIE,
  createdAt: ago(7 * 24),
  description: 'No update in 3 days. Migration of legacy auth to OAuth2 is stalled.',
});

// 1 item with AI suggestions
const aiSuggestedItem = makeItem('wi-ai-1', {
  title: 'Investigate memory leak in data pipeline',
  type: 'INGRESS',
  status: 'PENDING',
  priority: 'HIGH',
  fromMemberId: null,
  fromExternal: 'monitoring@acme.com',
  toMemberId: 'mbr-sarah',
  from: null,
  to: SARAH,
  createdAt: ago(2),
  description: 'Automated alert: data pipeline showing steady memory growth. Needs triage.',
  aiSuggestedOwner: 'mbr-marcus',
  aiSuggestedPriority: 'HIGH',
  aiRationale: 'Engineering-related task — Marcus owns this area',
});

export const MOCK_ITEMS: WorkItem[] = [
  ingress1,
  ingress2,
  ingress3,
  aiSuggestedItem,
  escalation1,
  escalation2,
  delegation1,
  delegation2,
  delegation3,
  atRisk1,
  staleItem,
];

// ─── Briefing Summary ─────────────────────────────────────────────────────────

export const MOCK_BRIEFING: BriefingSummary = {
  ingress: [ingress1, ingress2, ingress3, aiSuggestedItem],
  escalations: [escalation1, escalation2],
  atRisk: [atRisk1, staleItem],
  totals: {
    ingress: 4,
    escalations: 2,
    atRisk: 2,
    total: 8,
  },
};

// ─── Weekly Metrics ───────────────────────────────────────────────────────────

export const MOCK_WEEKLY: WeeklyBriefing = {
  period: {
    from: new Date(NOW - 7 * 86400_000).toISOString(),
    to: new Date(NOW).toISOString(),
  },
  stats: {
    completedThisWeek: 8,
    createdThisWeek: 14,
    overdueNow: 1,
  },
  byType: { INGRESS: 6, DELEGATION: 5, ESCALATION: 3 },
  byStatus: { PENDING: 4, IN_PROGRESS: 3, COMPLETED: 8, AT_RISK: 1, STALE: 1 },
  triageSpeedMs: 4 * 3600_000,
  escalationResponseMs: 2.5 * 3600_000,
  completionByMember: [
    { memberId: 'mbr-marcus', name: 'Marcus Thompson', role: 'VP Engineering', assigned: 4, completed: 3 },
    { memberId: 'mbr-priya',  name: 'Priya Patel',    role: 'VP Product',     assigned: 3, completed: 2 },
    { memberId: 'mbr-alex',   name: 'Alex Rivera',    role: 'Senior Engineer', assigned: 3, completed: 2 },
    { memberId: 'mbr-jamie',  name: 'Jamie Kim',       role: 'Engineer',        assigned: 2, completed: 1 },
    { memberId: 'mbr-david',  name: 'David Park',      role: 'Product Manager', assigned: 2, completed: 1 },
    { memberId: 'mbr-emma',   name: 'Emma Walsh',      role: 'Product Designer', assigned: 2, completed: 2 },
  ],
  delegationRatioByDay: [
    { date: '2026-03-27', delegations: 1, ingress: 4 },
    { date: '2026-03-28', delegations: 2, ingress: 3 },
    { date: '2026-03-29', delegations: 1, ingress: 3 },
    { date: '2026-03-30', delegations: 3, ingress: 3 },
    { date: '2026-03-31', delegations: 2, ingress: 2 },
    { date: '2026-04-01', delegations: 3, ingress: 2 },
    { date: '2026-04-02', delegations: 3, ingress: 1 },
  ],
};

// ─── Automation Opportunities ─────────────────────────────────────────────────

export const MOCK_AUTOMATION_OPPORTUNITIES: WorkItem[] = [
  makeItem('wi-auto-1', {
    title: 'Weekly status report routing to Marcus',
    type: 'DELEGATION',
    status: 'COMPLETED',
    priority: 'LOW',
    fromMemberId: 'mbr-sarah',
    toMemberId: 'mbr-marcus',
    from: SARAH,
    to: MARCUS,
    createdAt: ago(7 * 24),
    aiAutomatable: true,
    aiAutomationNotes: 'Weekly status reports always routed to Marcus — could be automated',
  }),
  makeItem('wi-auto-2', {
    title: 'PTO approval request — Jamie Kim',
    type: 'DELEGATION',
    status: 'COMPLETED',
    priority: 'LOW',
    fromMemberId: 'mbr-marcus',
    toMemberId: 'mbr-sarah',
    from: MARCUS,
    to: SARAH,
    createdAt: ago(5 * 24),
    aiAutomatable: true,
    aiAutomationNotes: 'PTO approval requests follow identical path every time',
  }),
];
