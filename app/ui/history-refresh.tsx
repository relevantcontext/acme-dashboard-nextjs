'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Guarantees fresh server data for views restored via browser history.
 *
 * Same-document back/forward (App Router soft navigation) is already covered:
 * every invoice mutation calls revalidatePath in a Server Action, which purges
 * the client router cache, so restored segments refetch. But two browser-level
 * mechanisms bypass the router entirely and can resurrect a stale snapshot:
 *
 * 1. bfcache — the browser freezes the whole document and thaws it on
 *    back/forward. No script re-runs, no request is made. Detectable via the
 *    `pageshow` event with `event.persisted === true`.
 * 2. HTTP-cache history loads — a cross-document back/forward re-creates the
 *    document from the browser's HTTP cache without revalidating (history
 *    navigations ignore response freshness). A fresh JS lifecycle runs, and
 *    the navigation entry reports `type === 'back_forward'`.
 *
 * In both cases we call router.refresh(), which re-fetches the current
 * route's server components while preserving client state, so the restored
 * view immediately converges on current data.
 */
export default function HistoryRefresh() {
  const router = useRouter();

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
    };
    window.addEventListener('pageshow', onPageShow);

    const [nav] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    if (nav?.type === 'back_forward') router.refresh();

    return () => window.removeEventListener('pageshow', onPageShow);
  }, [router]);

  return null;
}
