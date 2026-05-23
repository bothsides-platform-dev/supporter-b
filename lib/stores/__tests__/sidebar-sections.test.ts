import { describe, it, expect, beforeEach } from 'vitest';

// We import after setup so the store module is fresh each test (via beforeEach reset).
import { useSidebarSectionsStore } from '@/lib/stores/sidebar-sections';

beforeEach(() => {
  // Reset to default state between tests.
  useSidebarSectionsStore.setState({ collapsed: {} });
  localStorage.clear();
});

describe('useSidebarSectionsStore', () => {
  it('default: all sections are expanded (isCollapsed returns false for any id)', () => {
    const store = useSidebarSectionsStore.getState();
    expect(store.isCollapsed('rfp')).toBe(false);
    expect(store.isCollapsed('inbox')).toBe(false);
    expect(store.isCollapsed('settings')).toBe(false);
  });

  it('toggle: flips a section from expanded to collapsed', () => {
    const store = useSidebarSectionsStore.getState();
    store.toggle('rfp');
    expect(useSidebarSectionsStore.getState().isCollapsed('rfp')).toBe(true);
  });

  it('toggle: double-toggle returns the section to expanded', () => {
    const store = useSidebarSectionsStore.getState();
    store.toggle('settings');
    store.toggle('settings');
    expect(useSidebarSectionsStore.getState().isCollapsed('settings')).toBe(false);
  });

  it('toggle: independently manages multiple sections', () => {
    const store = useSidebarSectionsStore.getState();
    store.toggle('rfp');
    store.toggle('settings');
    expect(useSidebarSectionsStore.getState().isCollapsed('rfp')).toBe(true);
    expect(useSidebarSectionsStore.getState().isCollapsed('settings')).toBe(true);
    expect(useSidebarSectionsStore.getState().isCollapsed('inbox')).toBe(false);
  });
});
