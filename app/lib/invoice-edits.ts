// Shared vocabulary for the invoices table's bulk-edit mode: the draft overlay
// that client components keep on top of server-rendered rows, and the payload
// shape the batch-save Server Action accepts. Keep this module free of
// server-only imports (no postgres) so client components can use it too.

export type EditableInvoiceField = 'amount' | 'date' | 'status';
export type InvoiceStatus = 'pending' | 'paid';

export const EDITABLE_INVOICE_FIELDS: readonly EditableInvoiceField[] = [
  'amount',
  'date',
  'status',
] as const;

/**
 * One invoice's unsaved edits. Sparse on purpose: only fields the user
 * actually changed are present, so the batch save can update exactly those
 * columns and leave everything else — including changes that arrived from the
 * live payment generator meanwhile — untouched.
 *
 * `amount` is in cents (matching the invoices table), `date` is `YYYY-MM-DD`.
 */
export type InvoiceDraft = {
  amount?: number;
  date?: string;
  status?: InvoiceStatus;
};

/** All unsaved edits, keyed by invoice id. */
export type InvoiceDraftsMap = Record<string, InvoiceDraft>;

/** One entry of the batch-save payload. */
export type InvoiceEditPayload = { id: string; fields: InvoiceDraft };

export type InvoiceDraftValue = number | string;

/**
 * Normalizes the `date` column for editing/comparison. postgres.js may hand
 * the DATE column over as a string or a Date depending on parser config, and
 * RSC serialization preserves Dates, so handle both.
 */
export function toDateInputValue(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Parses the raw editor text for a field into its normalized draft value.
 * Returns null when the text isn't a usable value — the caller treats that
 * as "cancel" rather than storing a broken draft.
 */
export function parseDraftValue(
  field: EditableInvoiceField,
  raw: string,
): InvoiceDraftValue | null {
  switch (field) {
    case 'amount': {
      const dollars = Number(raw.replace(/[$,\s]/g, ''));
      if (!Number.isFinite(dollars) || dollars <= 0) return null;
      return Math.round(dollars * 100);
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    case 'status':
      return raw === 'paid' || raw === 'pending' ? raw : null;
  }
}
