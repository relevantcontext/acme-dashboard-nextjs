import { InvoiceFormSkeleton } from '@/app/ui/skeletons';

// Instant loading state for the edit-invoice form. This route is revalidated
// after every invoice mutation (freshness guarantee), so client navigations
// here always hit the server — the skeleton keeps that hop from feeling frozen.
export default function Loading() {
  return <InvoiceFormSkeleton />;
}
