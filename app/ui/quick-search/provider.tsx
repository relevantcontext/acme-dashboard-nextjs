'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import QuickSearchOverlay from '@/app/ui/quick-search/overlay';

/**
 * Owns the open/closed state of the global quick-search and the Cmd-K /
 * Ctrl-K shortcut. Mounted once in the dashboard layout, so the shortcut
 * works on every signed-in page. The sidebar trigger (or anything else)
 * opens it through the `useQuickSearch` context.
 *
 * The overlay is unmounted when closed, so each open starts with a clean
 * query and result state.
 */
const QuickSearchContext = createContext<{ open: () => void }>({
  open: () => {},
});

export function useQuickSearch() {
  return useContext(QuickSearchContext);
}

export default function QuickSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // Take the shortcut over the browser's default (e.g. focusing the
        // location bar in some browsers). Cmd-K toggles: open when closed,
        // closed when open.
        event.preventDefault();
        setIsOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <QuickSearchContext.Provider value={value}>
      {children}
      {isOpen ? <QuickSearchOverlay onClose={close} /> : null}
    </QuickSearchContext.Provider>
  );
}
