import { useEffect, useCallback } from 'react';
import { fetchItems, fetchBriefing } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import type { ItemsFilter } from '../lib/api';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export function useWorkItems(filter: ItemsFilter = {}) {
  const { setItems, setBriefing, setLoading, setError } = useAppStore();

  const load = useCallback(async () => {
    // No-op in demo mode — store is pre-seeded with mock data
    if (IS_DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const [items, briefing] = await Promise.all([
        fetchItems(filter),
        fetchBriefing(),
      ]);
      setItems(items);
      setBriefing(briefing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work items');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filter)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return { refresh: load };
}
