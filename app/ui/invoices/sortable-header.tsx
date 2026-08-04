'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import {
  DEFAULT_SORT_DIRECTIONS,
  InvoiceSortColumn,
  parseInvoiceSort,
} from '@/app/lib/invoice-sort';

/**
 * A sortable <th> for the invoices table. Clicking it navigates (push, so
 * back/forward walks through prior sorts) to the same path with `sort`/`dir`
 * updated: first click applies the column's default direction, clicking the
 * active column again reverses it. `page` is dropped so sorting returns to
 * page 1, and every other param (e.g. `query`) is preserved.
 */
export default function SortableHeader({
  column,
  children,
  className,
}: {
  column: InvoiceSortColumn;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeSort = parseInvoiceSort(
    searchParams.get('sort'),
    searchParams.get('dir'),
  );
  const isActive = activeSort?.column === column;
  const nextDirection = isActive
    ? activeSort!.direction === 'asc'
      ? 'desc'
      : 'asc'
    : DEFAULT_SORT_DIRECTIONS[column];

  const params = new URLSearchParams(searchParams);
  params.set('sort', column);
  params.set('dir', nextDirection);
  params.delete('page');

  return (
    <th
      scope="col"
      aria-sort={
        isActive
          ? activeSort!.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : undefined
      }
      className={className}
    >
      <Link
        href={`${pathname}?${params.toString()}`}
        className={clsx(
          'group inline-flex items-center gap-1 hover:text-blue-600',
          { 'text-blue-600': isActive },
        )}
      >
        {children}
        {isActive ? (
          activeSort!.direction === 'asc' ? (
            <ChevronUpIcon className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
          )
        ) : (
          <ChevronUpDownIcon
            className="h-4 w-4 text-gray-400 group-hover:text-blue-600"
            aria-hidden="true"
          />
        )}
      </Link>
    </th>
  );
}
