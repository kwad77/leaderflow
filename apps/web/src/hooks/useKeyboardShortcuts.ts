import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

export function useKeyboardShortcuts() {
  const { setSearchOpen, setSettingsOpen, setMetricsOpen } = useAppStore();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K / Ctrl+K — search
      if (meta && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }

      // Cmd+, / Ctrl+, — settings
      if (meta && e.key === ',') { e.preventDefault(); setSettingsOpen(true); }

      // Cmd+Shift+M — metrics/weekly review
      if (meta && e.shiftKey && e.key === 'M') { e.preventDefault(); setMetricsOpen(true); }

      // Escape — close any open panel (search takes priority, then settings, then metrics)
      // Don't handle Escape here — each panel handles its own Escape
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen, setSettingsOpen, setMetricsOpen]);
}
