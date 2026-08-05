import { InvoiceFormSkeleton } from '@/app/ui/skeletons';

// Instant loading state for the create-invoice form while the 200-customer
// dropdown list is fetched.
export default function Loading() {
  return <InvoiceFormSkeleton />;
}
