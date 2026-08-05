import { fetchFilteredInvoices } from '@/app/lib/data';
import EditableInvoicesTable from '@/app/ui/invoices/editable-table';
import { InvoiceSort } from '@/app/lib/invoice-sort';

/**
 * Server half of the invoices table: fetches the rows for the current
 * query/page/sort and hands them to the client-side editable table, which
 * overlays any unsaved drafts (see InvoiceEditsProvider) on top. Every
 * router.refresh() — e.g. the live payment events' throttled refresh — re-runs
 * this fetch and streams fresh rows into the SAME client component instance,
 * so external changes appear without disturbing unsaved edits.
 */
export default async function InvoicesTable({
  query,
  currentPage,
  sort,
}: {
  query: string;
  currentPage: number;
  sort: InvoiceSort | null;
}) {
  const invoices = await fetchFilteredInvoices(query, currentPage, sort);

  return <EditableInvoicesTable invoices={invoices} />;
}
