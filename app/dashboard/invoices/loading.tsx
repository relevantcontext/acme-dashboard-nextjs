import { InvoicesPageSkeleton } from '@/app/ui/skeletons';

// Instant loading state for /dashboard/invoices. On a cold document load the
// route shell (sidenav + this skeleton) streams immediately while the page's
// data renders; on client navigation into the segment it paints on click.
// Same-route searchParams changes (search/sort/page) don't re-trigger this —
// those are covered by the page's own <Suspense> boundaries.
export default function Loading() {
  return <InvoicesPageSkeleton />;
}
