import { CustomersPageSkeleton } from '@/app/ui/skeletons';

// Instant loading state for /dashboard/customers: the full-table aggregate
// query (200 customers joined against 5,000 invoices) streams in behind this
// skeleton instead of leaving the content area blank.
export default function Loading() {
  return <CustomersPageSkeleton />;
}
