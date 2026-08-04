// Shared invoice-sort vocabulary used by the server data layer, the invoices
// page, and the client column headers. Keep this module free of server-only
// imports (no postgres) so client components can use it too.

export const INVOICE_SORT_COLUMNS = [
  'customer',
  'amount',
  'date',
  'status',
] as const;

export type InvoiceSortColumn = (typeof INVOICE_SORT_COLUMNS)[number];
export type SortDirection = 'asc' | 'desc';

export type InvoiceSort = {
  column: InvoiceSortColumn;
  direction: SortDirection;
};

// Direction applied on the first click of a column header:
// text columns start A->Z, amount starts largest-first, date starts newest-first.
export const DEFAULT_SORT_DIRECTIONS: Record<InvoiceSortColumn, SortDirection> =
  {
    customer: 'asc',
    amount: 'desc',
    date: 'desc',
    status: 'asc',
  };

function isSortColumn(value: string): value is InvoiceSortColumn {
  return (INVOICE_SORT_COLUMNS as readonly string[]).includes(value);
}

/**
 * Parses the `sort` / `dir` URL params. Returns null when there is no valid
 * sort column, which callers treat as "keep the default order" (newest first).
 * An invalid or missing `dir` falls back to the column's first-click direction.
 */
export function parseInvoiceSort(
  sort?: string | null,
  dir?: string | null,
): InvoiceSort | null {
  if (!sort || !isSortColumn(sort)) return null;
  const direction: SortDirection =
    dir === 'asc' || dir === 'desc' ? dir : DEFAULT_SORT_DIRECTIONS[sort];
  return { column: sort, direction };
}
