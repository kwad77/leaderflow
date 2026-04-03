import { create } from 'zustand';
import type { OrgTree, WorkItem, BriefingSummary, OrgMember } from '@leaderflow/shared';

export type FilterPanel = 'ingress' | 'escalations' | 'atRisk' | null;

export interface AppState {
  // Org data
  orgId: string | null;
  orgName: string | null;
  orgTree: OrgTree | null;

  // Selected node
  selectedMemberId: string | null;

  // Filter panel
  activeFilter: FilterPanel;
  filterPanelOpen: boolean;

  // Work items
  items: WorkItem[];
  briefing: BriefingSummary | null;

  // UI state
  triageOpen: boolean;
  triageParentItem: WorkItem | null;
  metricsOpen: boolean;
  searchOpen: boolean;

  // Org chart depth
  orgDepth: number;
  settingsOpen: boolean;

  // Online status
  isOnline: boolean;

  // Role-based view
  currentUserRole: 'leader' | 'manager' | 'member';
  currentUser: OrgMember | null;

  // Loading
  loading: boolean;
  error: string | null;

  // Actions
  setOrg: (id: string, name: string, tree: OrgTree) => void;
  setSelectedMember: (id: string | null) => void;
  setActiveFilter: (filter: FilterPanel) => void;
  openFilter: (filter: FilterPanel) => void;
  closeFilter: () => void;
  setItems: (items: WorkItem[]) => void;
  upsertItem: (item: WorkItem) => void;
  setBriefing: (briefing: BriefingSummary) => void;
  openTriage: (parentItem?: WorkItem) => void;
  closeTriage: () => void;
  setMetricsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setOrgDepth: (depth: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setIsOnline: (online: boolean) => void;
  setCurrentUserRole: (role: 'leader' | 'manager' | 'member') => void;
  setCurrentUser: (member: OrgMember | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  orgId: null,
  orgName: null,
  orgTree: null,
  selectedMemberId: null,
  activeFilter: null,
  filterPanelOpen: false,
  items: [],
  briefing: null,
  triageOpen: false,
  triageParentItem: null,
  metricsOpen: false,
  searchOpen: false,
  orgDepth: Number(localStorage.getItem('leaderflow-org-depth') ?? '3'),
  settingsOpen: false,
  isOnline: true,
  currentUserRole: 'leader',
  currentUser: null,
  loading: false,
  error: null,

  // Actions
  setOrg: (id, name, tree) => set({ orgId: id, orgName: name, orgTree: tree }),

  setSelectedMember: (id) => set({ selectedMemberId: id }),

  setActiveFilter: (filter) => set({ activeFilter: filter }),

  openFilter: (filter) => set({ activeFilter: filter, filterPanelOpen: true }),

  closeFilter: () => set({ filterPanelOpen: false }),

  setItems: (items) => set({ items }),

  upsertItem: (item) =>
    set((state) => {
      const idx = state.items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const updated = [...state.items];
        updated[idx] = item;
        return { items: updated };
      }
      return { items: [item, ...state.items] };
    }),

  setBriefing: (briefing) => set({ briefing }),

  openTriage: (parentItem) => set({ triageOpen: true, triageParentItem: parentItem ?? null }),

  closeTriage: () => set({ triageOpen: false, triageParentItem: null }),

  setMetricsOpen: (open) => set({ metricsOpen: open }),

  setSearchOpen: (open) => set({ searchOpen: open }),

  setOrgDepth: (depth) => {
    localStorage.setItem('leaderflow-org-depth', String(depth));
    set({ orgDepth: depth });
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setIsOnline: (online) => set({ isOnline: online }),

  setCurrentUserRole: (role) => set({ currentUserRole: role }),

  setCurrentUser: (member) => set({ currentUser: member }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));

// Derived selectors
export const selectItemsByType = (items: WorkItem[], type: string) =>
  items.filter((i) => i.type === type);

export const selectItemsForMember = (items: WorkItem[], memberId: string) =>
  items.filter((i) => i.toMemberId === memberId || i.fromMemberId === memberId);

export const selectActiveItems = (items: WorkItem[]) =>
  items.filter(
    (i) => !['COMPLETED', 'ARCHIVED'].includes(i.status)
  );
