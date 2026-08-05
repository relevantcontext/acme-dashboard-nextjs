'use client';

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentEvent } from '@/app/lib/definitions';

/**
 * Owns the app's single EventSource to /api/events/stream and fans its events
 * out to two places:
 *
 * 1. React context — the live activity feed renders the event list; the
 *    quick-search overlay watches `latestEventId` to refetch its
 *    client-fetched results.
 * 2. The App Router — each event batch triggers a throttled router.refresh(),
 *    which re-fetches the CURRENT route's Server Components and merges the
 *    new RSC payload without touching client state. That one call is what
 *    keeps every server-rendered surface live (dashboard cards, latest
 *    invoices, invoices table, pagination count) while explicitly NOT
 *    disturbing in-progress work:
 *
 *    - URL is untouched, so search query, sort and page params survive.
 *    - Client components are not remounted, so the search input's text,
 *      focus, scroll position, and the open quick-search overlay all keep
 *      their state.
 *    - refresh() is dispatched in a transition and goes through the router's
 *      sequential action queue, so it serializes with in-flight Server
 *      Actions (the status toggle) instead of racing them; useOptimistic
 *      keeps the toggled badge painted on top of any refreshed data until
 *      the toggle's own action settles.
 *
 * Mounted once in the dashboard layout, i.e. only while signed in. Unmounting
 * (sign-out navigates to a route outside the layout; leaving closes the tab)
 * closes the EventSource, and with the last stream closed the server stops
 * generating activity. Reconnects after a drop resume via Last-Event-ID
 * (EventSource sends it automatically); a dedupe-by-id guard makes redelivery
 * harmless.
 */

const FEED_LIMIT = 30;
const REFRESH_THROTTLE_MS = 1_500;

type LiveEventsValue = {
  events: PaymentEvent[];
  latestEventId: number;
  isLive: boolean;
};

const LiveEventsContext = createContext<LiveEventsValue>({
  events: [],
  latestEventId: 0,
  isLive: false,
});

export function useLiveEvents() {
  return useContext(LiveEventsContext);
}

export default function LiveEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [isLive, setIsLive] = useState(false);
  const lastRefreshAtRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/events/stream');

    // Trailing-edge throttle: a burst of events inside one tick becomes one
    // refresh, but the LAST event always gets one, so every surface converges
    // within a couple of seconds of the newest event.
    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) return;
      const wait = Math.max(
        0,
        lastRefreshAtRef.current + REFRESH_THROTTLE_MS - Date.now(),
      );
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        lastRefreshAtRef.current = Date.now();
        startTransition(() => router.refresh());
      }, wait);
    };

    source.onopen = () => setIsLive(true);
    source.onerror = () => setIsLive(false);
    source.onmessage = (message) => {
      let event: PaymentEvent;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      setEvents((current) =>
        current.some((existing) => existing.id === event.id)
          ? current
          : [event, ...current].slice(0, FEED_LIMIT),
      );
      scheduleRefresh();
    };

    return () => {
      source.close();
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [router]);

  const value = useMemo(
    () => ({
      events,
      latestEventId: events.length > 0 ? events[0].id : 0,
      isLive,
    }),
    [events, isLive],
  );

  return (
    <LiveEventsContext.Provider value={value}>
      {children}
    </LiveEventsContext.Provider>
  );
}
