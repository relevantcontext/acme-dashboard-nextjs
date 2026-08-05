'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import { UpdateInvoice, DeleteInvoice } from '@/app/ui/invoices/buttons';
import InvoiceStatus from '@/app/ui/invoices/status';
import SortableHeader from '@/app/ui/invoices/sortable-header';
import { useInvoiceEdits } from '@/app/ui/invoices/edits-provider';
import { formatDateToLocal, formatCurrency } from '@/app/lib/utils';
import type { InvoicesTable } from '@/app/lib/definitions';
import {
  EDITABLE_INVOICE_FIELDS,
  EditableInvoiceField,
  InvoiceStatus as InvoiceStatusValue,
  toDateInputValue,
} from '@/app/lib/invoice-edits';

/**
 * Client half of the invoices table. Receives the server-fetched rows for the
 * current query/page/sort and renders them with the unsaved draft overlay from
 * InvoiceEditsProvider applied on top. Because rows arrive as props from the
 * server render and drafts live in the provider above the Suspense boundary,
 * a live-event router.refresh() swaps in fresh rows while every draft (and an
 * in-progress cell editor) stays intact.
 *
 * Interaction model (desktop table):
 * - Click an amount/date/status cell, or move the visible cell cursor with
 *   the arrow keys and press Enter, to edit in place.
 * - Enter/blur commits the edit as a draft (marks the row edited — nothing is
 *   saved yet); Escape cancels.
 * - Shift-click a row or Shift-Arrow up/down range-selects rows; the toolbar
 *   above the table sets the whole range to paid or pending in one action
 *   (one undo step).
 *
 * The mobile card list renders the same merged values; tapping a card's
 * status badge toggles a status draft (same commit-to-draft model).
 */

type Cursor = { row: number; col: number };

export default function EditableInvoicesTable({
  invoices,
}: {
  invoices: InvoicesTable[];
}) {
  const {
    drafts,
    editing,
    startEditing,
    commitEditing,
    applyFieldDraft,
    applyBulkStatus,
  } = useInvoiceEdits();

  const containerRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursorState] = useState<Cursor | null>(null);
  const [anchor, setAnchorState] = useState<number | null>(null);
  const [selEnd, setSelEndState] = useState<number | null>(null);

  // Synchronous mirrors: key-repeat can deliver several keydowns before React
  // re-renders, so handlers read/write these refs and mirror into state.
  const cursorRef = useRef<Cursor | null>(null);
  const anchorRef = useRef<number | null>(null);
  const selEndRef = useRef<number | null>(null);

  const setCursor = useCallback((next: Cursor | null) => {
    cursorRef.current = next;
    setCursorState(next);
  }, []);
  const setAnchor = useCallback((next: number | null) => {
    anchorRef.current = next;
    setAnchorState(next);
  }, []);
  const setSelEnd = useCallback((next: number | null) => {
    selEndRef.current = next;
    setSelEndState(next);
  }, []);

  const rowCount = invoices.length;

  const focusContainer = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  // If the row being edited leaves the current page (live event reordered or
  // displaced it, or the user paginated), commit the in-progress text as a
  // draft instead of dropping it. Unmounting inputs never fire blur.
  useEffect(() => {
    if (editing && !invoices.some((invoice) => invoice.id === editing.id)) {
      commitEditing();
    }
  }, [invoices, editing, commitEditing]);

  // Keep cursor/selection inside the row range when the page shrinks.
  useEffect(() => {
    if (rowCount === 0) {
      setCursor(null);
      setAnchor(null);
      setSelEnd(null);
      return;
    }
    const max = rowCount - 1;
    const c = cursorRef.current;
    if (c && c.row > max) setCursor({ ...c, row: max });
    if (anchorRef.current !== null && anchorRef.current > max) setAnchor(max);
    if (selEndRef.current !== null && selEndRef.current > max) setSelEnd(max);
  }, [rowCount, setCursor, setAnchor, setSelEnd]);

  const selectedRange: [number, number] | null =
    anchor !== null && selEnd !== null
      ? [Math.min(anchor, selEnd), Math.max(anchor, selEnd)]
      : null;
  const selectedInvoices = selectedRange
    ? invoices.slice(selectedRange[0], selectedRange[1] + 1)
    : [];

  const beginEdit = useCallback(
    (invoice: InvoicesTable, field: EditableInvoiceField) => {
      const draft = drafts[invoice.id];
      if (field === 'amount') {
        const cents = draft?.amount ?? invoice.amount;
        startEditing(invoice.id, 'amount', invoice.amount, (cents / 100).toFixed(2));
      } else if (field === 'date') {
        const base = toDateInputValue(invoice.date);
        startEditing(invoice.id, 'date', base, draft?.date ?? base);
      } else {
        startEditing(invoice.id, 'status', invoice.status, draft?.status ?? invoice.status);
      }
    },
    [drafts, startEditing],
  );

  const extendSelection = useCallback(
    (row: number) => {
      if (anchorRef.current === null) {
        setAnchor(cursorRef.current?.row ?? row);
      }
      setSelEnd(row);
      setCursor({ row, col: cursorRef.current?.col ?? 0 });
    },
    [setAnchor, setSelEnd, setCursor],
  );

  const handleCellClick = useCallback(
    (
      event: React.MouseEvent,
      rowIndex: number,
      colIndex: number,
      invoice: InvoicesTable,
      field: EditableInvoiceField,
    ) => {
      event.stopPropagation();
      if (event.shiftKey) {
        extendSelection(rowIndex);
        focusContainer();
        return;
      }
      setAnchor(rowIndex);
      setSelEnd(null);
      setCursor({ row: rowIndex, col: colIndex });
      beginEdit(invoice, field);
    },
    [extendSelection, focusContainer, beginEdit, setAnchor, setSelEnd, setCursor],
  );

  const handleRowClick = useCallback(
    (event: React.MouseEvent, rowIndex: number) => {
      if (event.shiftKey) {
        extendSelection(rowIndex);
      } else {
        setAnchor(rowIndex);
        setSelEnd(null);
        setCursor({ row: rowIndex, col: cursorRef.current?.col ?? 0 });
      }
      focusContainer();
    },
    [extendSelection, focusContainer, setAnchor, setSelEnd, setCursor],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // While a cell editor is open its keys (including arrows) belong to the
      // editor; the editor's own handlers commit/cancel.
      if (editing) return;
      if (rowCount === 0) return;

      const move = (dRow: number, dCol: number, extend: boolean) => {
        const current = cursorRef.current;
        const from = current ?? { row: 0, col: 0 };
        const row = current
          ? Math.min(Math.max(from.row + dRow, 0), rowCount - 1)
          : 0;
        const col = current
          ? Math.min(
              Math.max(from.col + dCol, 0),
              EDITABLE_INVOICE_FIELDS.length - 1,
            )
          : 0;
        if (extend && dRow !== 0) {
          if (anchorRef.current === null) setAnchor(from.row);
          setSelEnd(row);
        } else {
          setAnchor(row);
          setSelEnd(null);
        }
        setCursor({ row, col });
      };

      switch (event.key) {
        case 'ArrowDown':
          move(1, 0, event.shiftKey);
          break;
        case 'ArrowUp':
          move(-1, 0, event.shiftKey);
          break;
        case 'ArrowRight':
          move(0, 1, false);
          break;
        case 'ArrowLeft':
          move(0, -1, false);
          break;
        case 'Enter': {
          const current = cursorRef.current;
          if (!current) {
            setCursor({ row: 0, col: 0 });
            break;
          }
          const invoice = invoices[current.row];
          if (invoice) beginEdit(invoice, EDITABLE_INVOICE_FIELDS[current.col]);
          break;
        }
        case 'Escape':
          setAnchor(null);
          setSelEnd(null);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [editing, rowCount, invoices, beginEdit, setAnchor, setSelEnd, setCursor],
  );

  const bulkSetStatus = useCallback(
    (status: InvoiceStatusValue) => {
      if (selectedInvoices.length === 0) return;
      applyBulkStatus(
        selectedInvoices.map((invoice) => ({
          id: invoice.id,
          base: invoice.status,
        })),
        status,
      );
    },
    [selectedInvoices, applyBulkStatus],
  );

  const isEditingCell = (id: string, field: EditableInvoiceField) =>
    editing?.id === id && editing.field === field;

  return (
    <div className="mt-6 flow-root">
      <div className="inline-block min-w-full align-middle">
        <div className="rounded-lg bg-gray-50 p-2 md:pt-0">
          <div className="md:hidden">
            {invoices?.map((invoice) => {
              const draft = drafts[invoice.id];
              const amount = draft?.amount ?? invoice.amount;
              const date = draft?.date ?? invoice.date;
              const status = draft?.status ?? invoice.status;
              return (
                <div
                  key={invoice.id}
                  className={clsx('mb-2 w-full rounded-md bg-white p-4', {
                    'ring-1 ring-inset ring-amber-400': draft,
                  })}
                >
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <div className="mb-2 flex items-center">
                        <Image
                          src={invoice.image_url}
                          className="mr-2 rounded-full"
                          width={28}
                          height={28}
                          alt={`${invoice.name}'s profile picture`}
                        />
                        <p>{invoice.name}</p>
                        {draft && <EditedDot />}
                      </div>
                      <p className="text-sm text-gray-500">{invoice.email}</p>
                    </div>
                    {/* Tapping toggles a status DRAFT (marks the invoice
                        edited); nothing saves until Save All. */}
                    <button
                      type="button"
                      aria-label={`Invoice status: ${status}. Mark as ${
                        status === 'paid' ? 'pending' : 'paid'
                      } (unsaved until Save All).`}
                      onClick={() =>
                        applyFieldDraft(
                          invoice.id,
                          'status',
                          status === 'paid' ? 'pending' : 'paid',
                          invoice.status,
                        )
                      }
                      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <InvoiceStatus status={status} />
                    </button>
                  </div>
                  <div className="flex w-full items-center justify-between pt-4">
                    <div>
                      <p className="text-xl font-medium">
                        {formatCurrency(amount)}
                      </p>
                      <p>{formatDateToLocal(date)}</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <UpdateInvoice id={invoice.id} />
                      <DeleteInvoice id={invoice.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedInvoices.length > 0 && (
            <div
              data-testid="bulk-toolbar"
              className="mb-2 hidden items-center gap-3 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-900 md:flex"
            >
              <span>
                {selectedInvoices.length} row
                {selectedInvoices.length === 1 ? '' : 's'} selected
              </span>
              <button
                type="button"
                onClick={() => bulkSetStatus('paid')}
                className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-400"
              >
                Set paid
              </button>
              <button
                type="button"
                onClick={() => bulkSetStatus('pending')}
                className="rounded-md bg-gray-500 px-3 py-1 text-xs font-medium text-white hover:bg-gray-400"
              >
                Set pending
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnchor(null);
                  setSelEnd(null);
                }}
                className="text-xs text-blue-700 underline"
              >
                Clear selection
              </button>
            </div>
          )}

          <div
            ref={containerRef}
            tabIndex={0}
            role="application"
            aria-label="Editable invoices table. Arrow keys move the cell cursor, Enter edits, Shift with arrows or click selects rows."
            onKeyDown={handleKeyDown}
            className="hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 md:block"
          >
            <table className="min-w-full text-gray-900">
              <thead className="rounded-lg text-left text-sm font-normal">
                <tr>
                  <SortableHeader
                    column="customer"
                    className="px-4 py-5 font-medium sm:pl-6"
                  >
                    Customer
                  </SortableHeader>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Email
                  </th>
                  <SortableHeader
                    column="amount"
                    className="px-3 py-5 font-medium"
                  >
                    Amount
                  </SortableHeader>
                  <SortableHeader column="date" className="px-3 py-5 font-medium">
                    Date
                  </SortableHeader>
                  <SortableHeader
                    column="status"
                    className="px-3 py-5 font-medium"
                  >
                    Status
                  </SortableHeader>
                  <th scope="col" className="relative py-3 pl-6 pr-3">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {invoices?.map((invoice, rowIndex) => {
                  const draft = drafts[invoice.id];
                  const isSelected =
                    selectedRange !== null &&
                    rowIndex >= selectedRange[0] &&
                    rowIndex <= selectedRange[1];
                  const merged = {
                    amount: draft?.amount ?? invoice.amount,
                    date: draft?.date ?? invoice.date,
                    status: draft?.status ?? invoice.status,
                  };
                  const cellProps = (
                    field: EditableInvoiceField,
                    colIndex: number,
                  ) => ({
                    'data-field': field,
                    onClick: (event: React.MouseEvent) =>
                      handleCellClick(event, rowIndex, colIndex, invoice, field),
                    className: clsx(
                      'whitespace-nowrap px-3 py-3 cursor-pointer',
                      cursor?.row === rowIndex &&
                        cursor.col === colIndex &&
                        'ring-2 ring-inset ring-blue-600',
                      draft?.[field] !== undefined && 'bg-amber-100/80',
                    ),
                    title:
                      draft?.[field] !== undefined
                        ? 'Unsaved edit'
                        : 'Click or press Enter to edit',
                  });
                  return (
                    <tr
                      key={invoice.id}
                      data-invoice-id={invoice.id}
                      data-edited={draft ? '' : undefined}
                      data-selected={isSelected ? '' : undefined}
                      onClick={(event) => handleRowClick(event, rowIndex)}
                      className={clsx(
                        'w-full select-none border-b py-3 text-sm last-of-type:border-none [&:first-child>td:first-child]:rounded-tl-lg [&:first-child>td:last-child]:rounded-tr-lg [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg',
                        isSelected && 'bg-blue-50',
                      )}
                    >
                      <td className="whitespace-nowrap py-3 pl-6 pr-3">
                        <div className="flex items-center gap-3">
                          <Image
                            src={invoice.image_url}
                            className="rounded-full"
                            width={28}
                            height={28}
                            alt={`${invoice.name}'s profile picture`}
                          />
                          <p>{invoice.name}</p>
                          {draft && <EditedDot />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {invoice.email}
                      </td>
                      <td {...cellProps('amount', 0)}>
                        {isEditingCell(invoice.id, 'amount') ? (
                          <CellEditor focusContainer={focusContainer} />
                        ) : (
                          formatCurrency(merged.amount)
                        )}
                      </td>
                      <td {...cellProps('date', 1)}>
                        {isEditingCell(invoice.id, 'date') ? (
                          <CellEditor focusContainer={focusContainer} />
                        ) : (
                          formatDateToLocal(merged.date)
                        )}
                      </td>
                      <td {...cellProps('status', 2)}>
                        {isEditingCell(invoice.id, 'status') ? (
                          <CellEditor focusContainer={focusContainer} />
                        ) : (
                          <InvoiceStatus status={merged.status} />
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pl-6 pr-3">
                        <div className="flex justify-end gap-3">
                          <UpdateInvoice id={invoice.id} />
                          <DeleteInvoice id={invoice.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditedDot() {
  return (
    <span
      title="Unsaved edits"
      aria-label="Unsaved edits"
      className="ml-1 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500"
    />
  );
}

/**
 * The in-place editor for the cell currently in `editing`. Its text lives in
 * the provider (not local state) so a mid-keystroke live-event refresh — or
 * even a row remount — cannot lose it; on remount, autoFocus restores focus
 * and the controlled value picks up exactly where it was.
 */
function CellEditor({ focusContainer }: { focusContainer: () => void }) {
  const { editing, setEditingValue, commitEditing, cancelEditing } =
    useInvoiceEdits();
  if (!editing) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitEditing();
      focusContainer();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelEditing();
      focusContainer();
    }
  };

  if (editing.field === 'status') {
    return (
      <select
        autoFocus
        value={editing.value}
        onChange={(event) => setEditingValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commitEditing()}
        onClick={(event) => event.stopPropagation()}
        aria-label="Edit status"
        className="rounded-md border border-blue-400 py-0.5 pl-1 pr-7 text-sm focus:outline-none"
      >
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
      </select>
    );
  }

  return (
    <input
      autoFocus
      type={editing.field === 'date' ? 'date' : 'text'}
      inputMode={editing.field === 'amount' ? 'decimal' : undefined}
      value={editing.value}
      onChange={(event) => setEditingValue(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => commitEditing()}
      onClick={(event) => event.stopPropagation()}
      aria-label={`Edit ${editing.field}`}
      className="w-32 rounded-md border border-blue-400 px-1 py-0.5 text-sm focus:outline-none"
    />
  );
}
