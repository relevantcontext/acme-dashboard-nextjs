'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import StatusToggle from '@/app/ui/invoices/status-toggle';
import { useLiveEvents } from '@/app/ui/live/live-events-provider';
import { formatCurrency, formatDateToLocal } from '@/app/lib/utils';
import type { QuickSearchResults } from '@/app/lib/definitions';

const EMPTY_RESULTS: QuickSearchResults = { customers: [], invoices: [] };

/**
 * The Cmd-K overlay: a combobox over /api/search.
 *
 * - Fires a request on every keystroke; an AbortController cancels the
 *   in-flight request so a slow earlier response can never overwrite a newer
 *   one. Results render in full (the endpoint bounds them) inside a
 *   scrollable panel, grouped customers-then-invoices.
 * - Keyboard model: focus stays in the input (standard combobox +
 *   aria-activedescendant). ArrowUp/Down move the highlight across the
 *   flattened row list, Enter opens the highlighted row, Escape closes.
 *   Arrow/Enter handling is gated on the event target being the input so a
 *   Tab-focused status toggle keeps its own Enter behavior.
 * - Invoice rows link to the invoice's edit page and carry the same
 *   StatusToggle used by the invoices table. The toggle's Server Action
 *   revalidates every invoice surface (so pages behind the overlay are fresh
 *   on navigation); `onToggled` refetches the overlay's own client-fetched
 *   list so the optimistic badge settles onto persisted data.
 * - Customer rows open the invoices page filtered to that customer.
 */

type Row =
  | {
      kind: 'customer';
      domId: string;
      href: string;
      customer: QuickSearchResults['customers'][number];
    }
  | {
      kind: 'invoice';
      domId: string;
      href: string;
      invoice: QuickSearchResults['invoices'][number];
    };

export default function QuickSearchOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<QuickSearchResults>(EMPTY_RESULTS);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const termRef = useRef('');

  const runSearch = useCallback(async (rawTerm: string) => {
    abortRef.current?.abort();
    const query = rawTerm.trim();

    if (!query) {
      abortRef.current = null;
      setResults(EMPTY_RESULTS);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Search request failed.');
      const data: QuickSearchResults = await response.json();
      setResults(data);
      setIsSearching(false);
    } catch (error) {
      // An aborted request means a newer keystroke owns the UI — do nothing.
      if (controller.signal.aborted) return;
      console.error('Quick search failed:', error);
      setResults(EMPTY_RESULTS);
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // The overlay's results are client-fetched, so router.refresh() can't renew
  // them — instead, re-run the current search whenever a live payment event
  // lands. This never disturbs what the user is doing: the input (and its
  // text, focus, and caret) is untouched, the highlight index is preserved
  // (and clamped if the list shrinks), and runSearch's AbortController
  // already guarantees the newest request wins. Skips when the query is
  // empty — including on mount, where latestEventId is just "whatever the
  // provider has seen so far".
  const { latestEventId } = useLiveEvents();
  useEffect(() => {
    if (termRef.current.trim()) runSearch(termRef.current);
  }, [latestEventId, runSearch]);

  const rows: Row[] = useMemo(
    () => [
      ...results.customers.map((customer) => ({
        kind: 'customer' as const,
        domId: `quick-search-customer-${customer.id}`,
        href: `/dashboard/invoices?query=${encodeURIComponent(customer.name)}`,
        customer,
      })),
      ...results.invoices.map((invoice) => ({
        kind: 'invoice' as const,
        domId: `quick-search-invoice-${invoice.id}`,
        href: `/dashboard/invoices/${invoice.id}/edit`,
        invoice,
      })),
    ],
    [results],
  );

  // Keep the highlight in range when a refetch shrinks the list.
  useEffect(() => {
    if (activeIndex > 0 && activeIndex >= rows.length) {
      setActiveIndex(Math.max(rows.length - 1, 0));
    }
  }, [rows.length, activeIndex]);

  // Keep the highlighted row visible inside the scrollable panel.
  useEffect(() => {
    const domId = rows[activeIndex]?.domId;
    if (domId) {
      document.getElementById(domId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, rows]);

  const navigateTo = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    // Arrow/Enter only drive the highlight while focus is in the input, so a
    // Tab-focused status toggle still gets its own Enter activation.
    const isFromInput =
      event.target instanceof HTMLElement && event.target.tagName === 'INPUT';
    if (!isFromInput || rows.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) navigateTo(row.href);
    }
  }

  const activeDomId = rows[activeIndex]?.domId;
  const hasQuery = term.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/40 p-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
      >
        <div className="relative border-b border-gray-200">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="quick-search-results"
            aria-activedescendant={activeDomId}
            aria-label="Search customers and invoices"
            placeholder="Search customers and invoices..."
            className="w-full border-0 py-4 pl-12 pr-4 text-sm outline-none placeholder:text-gray-500"
            value={term}
            onChange={(event) => {
              const value = event.target.value;
              setTerm(value);
              termRef.current = value;
              setActiveIndex(0);
              runSearch(value);
            }}
          />
        </div>

        <div
          id="quick-search-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-[60vh] overflow-y-auto overscroll-contain"
        >
          {!hasQuery ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              Type to search customers and invoices.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              {isSearching ? 'Searching...' : `No matches for “${term.trim()}”.`}
            </p>
          ) : (
            <>
              {results.customers.length > 0 && (
                <div>
                  <h3 className="sticky top-0 bg-gray-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Customers ({results.customers.length})
                  </h3>
                  {rows
                    .filter((row) => row.kind === 'customer')
                    .map((row, index) => (
                      <CustomerRow
                        key={row.domId}
                        row={row}
                        isActive={index === activeIndex}
                        onHover={() => setActiveIndex(index)}
                        onNavigate={onClose}
                      />
                    ))}
                </div>
              )}
              {results.invoices.length > 0 && (
                <div>
                  <h3 className="sticky top-0 bg-gray-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Invoices ({results.invoices.length})
                  </h3>
                  {rows
                    .filter((row) => row.kind === 'invoice')
                    .map((row, index) => {
                      const flatIndex = results.customers.length + index;
                      return (
                        <InvoiceRow
                          key={row.domId}
                          row={row}
                          isActive={flatIndex === activeIndex}
                          onHover={() => setActiveIndex(flatIndex)}
                          onNavigate={onClose}
                          onToggled={() => runSearch(termRef.current)}
                        />
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          <span>
            <kbd className="rounded border border-gray-300 bg-white px-1">↑↓</kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-gray-300 bg-white px-1">↵</kbd>{' '}
            open
          </span>
          <span>
            <kbd className="rounded border border-gray-300 bg-white px-1">esc</kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}

function CustomerRow({
  row,
  isActive,
  onHover,
  onNavigate,
}: {
  row: Extract<Row, { kind: 'customer' }>;
  isActive: boolean;
  onHover: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      id={row.domId}
      role="option"
      aria-selected={isActive}
      onMouseEnter={onHover}
      className={isActive ? 'bg-sky-100' : 'bg-white'}
    >
      <Link
        href={row.href}
        onClick={onNavigate}
        className="flex items-center gap-3 px-4 py-3 text-sm"
      >
        <Image
          src={row.customer.image_url}
          className="rounded-full"
          width={28}
          height={28}
          alt={`${row.customer.name}'s profile picture`}
        />
        <span className="font-medium text-gray-900">{row.customer.name}</span>
        <span className="text-gray-500">{row.customer.email}</span>
        <span className="ml-auto text-xs text-gray-400">View invoices →</span>
      </Link>
    </div>
  );
}

function InvoiceRow({
  row,
  isActive,
  onHover,
  onNavigate,
  onToggled,
}: {
  row: Extract<Row, { kind: 'invoice' }>;
  isActive: boolean;
  onHover: () => void;
  onNavigate: () => void;
  onToggled: () => Promise<void>;
}) {
  const { invoice } = row;
  return (
    <div
      id={row.domId}
      role="option"
      aria-selected={isActive}
      onMouseEnter={onHover}
      className={`flex items-center gap-3 pr-4 ${
        isActive ? 'bg-sky-100' : 'bg-white'
      }`}
    >
      <Link
        href={row.href}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-sm"
      >
        <span className="min-w-0 truncate font-medium text-gray-900">
          {invoice.name}
        </span>
        <span className="whitespace-nowrap text-gray-700">
          {formatCurrency(invoice.amount)}
        </span>
        <span className="whitespace-nowrap text-gray-500">
          {formatDateToLocal(invoice.date)}
        </span>
      </Link>
      {/* Sibling of the Link (never nested inside it) so toggling the status
          does not navigate. */}
      <StatusToggle
        id={invoice.id}
        status={invoice.status}
        onToggled={onToggled}
      />
    </div>
  );
}
