import { useEffect } from 'react';
import { joinOrg, onEvent } from '../lib/socket';
import { fetchOrgTree } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import type { OrgTree, WorkItem } from '@leaderflow/shared';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export function useRealtime(orgId: string | null) {
  const { upsertItem, setBriefing, briefing } = useAppStore();

  useEffect(() => {
    // No-op in demo mode — no socket server to connect to
    if (IS_DEMO || !orgId) return;

    joinOrg(orgId);

    const unsubscribe = onEvent((event) => {
      console.log('[realtime] event:', event.type, event.payload);

      switch (event.type) {
        case 'ITEM_CREATED':
        case 'ITEM_UPDATED':
        case 'ITEM_DELEGATED':
        case 'ITEM_ACKNOWLEDGED':
        case 'ITEM_COMPLETED': {
          const item = event.payload as WorkItem;
          upsertItem(item);

          // Update briefing counts if it's loaded
          if (briefing) {
            const updated = { ...briefing };

            if (event.type === 'ITEM_CREATED' && item.type === 'INGRESS') {
              updated.ingress = [...updated.ingress, item];
              updated.totals = {
                ...updated.totals,
                ingress: updated.totals.ingress + 1,
                total: updated.totals.total + 1,
              };
              setBriefing(updated);
            } else if (event.type === 'ITEM_COMPLETED') {
              // Remove from ingress/escalations/atRisk if present
              updated.ingress = updated.ingress.filter((i) => i.id !== item.id);
              updated.escalations = updated.escalations.filter((i) => i.id !== item.id);
              updated.atRisk = updated.atRisk.filter((i) => i.id !== item.id);
              updated.totals = {
                ingress: updated.ingress.length,
                escalations: updated.escalations.length,
                atRisk: updated.atRisk.length,
                total:
                  updated.ingress.length +
                  updated.escalations.length +
                  updated.atRisk.length,
              };
              setBriefing(updated);
            } else if (event.type === 'ITEM_ACKNOWLEDGED') {
              // Update the item in briefing lists in place
              const updateInList = (list: WorkItem[]) =>
                list.map((i) => (i.id === item.id ? item : i));
              updated.ingress = updateInList(updated.ingress);
              updated.escalations = updateInList(updated.escalations);
              updated.atRisk = updateInList(updated.atRisk);
              setBriefing(updated);
            }
          }
          break;
        }

        case 'ORG_UPDATED': {
          // Refetch the org tree from the API and update store
          fetchOrgTree()
            .then(({ org, tree }) => {
              useAppStore.getState().setOrg(org.id, org.name, tree as OrgTree);
            })
            .catch(console.error);
          break;
        }

        default:
          break;
      }
    });

    return unsubscribe;
  }, [orgId, upsertItem, setBriefing, briefing]);
}
