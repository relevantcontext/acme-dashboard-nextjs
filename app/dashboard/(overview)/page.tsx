import CardWrapper from '@/app/ui/dashboard/cards';
import RevenueChart from '@/app/ui/dashboard/revenue-chart';
import LatestInvoices from '@/app/ui/dashboard/latest-invoices';
import LiveActivityFeed from '@/app/ui/live/activity-feed';
import { lusitana } from '@/app/ui/fonts';
import { Suspense } from 'react';
import {
  RevenueChartSkeleton,
  LatestInvoicesSkeleton,
  CardsSkeleton,
} from '@/app/ui/skeletons';

// Real-time payments: without this, `next build` prerenders this route (its
// data reads don't touch any request-time API), and in production the
// event-driven router.refresh() would be served the stale prerender from the
// Full Route Cache — refresh() re-fetches but does not revalidate server-side
// caches. The cards/latest-invoices data changes every few seconds now, so
// render it per-request like /dashboard/invoices already is.
export const dynamic = 'force-dynamic';

export default async function Page() {
  return (
    <main>
      <h1 className={`${lusitana.className} mb-4 text-xl md:text-2xl`}>
        Dashboard
      </h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<CardsSkeleton />}>
          <CardWrapper />
        </Suspense>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
        <Suspense fallback={<RevenueChartSkeleton />}>
          <RevenueChart />
        </Suspense>
        <Suspense fallback={<LatestInvoicesSkeleton />}>
          <LatestInvoices />
        </Suspense>
      </div>
      {/* Client component fed by LiveEventsProvider (dashboard layout) — no
          data fetching of its own, so no Suspense boundary needed. */}
      <div className="mt-6">
        <LiveActivityFeed />
      </div>
    </main>
  );
}
