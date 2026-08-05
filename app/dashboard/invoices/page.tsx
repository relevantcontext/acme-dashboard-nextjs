import Pagination from '@/app/ui/invoices/pagination';
import Search from '@/app/ui/search';
import Table from '@/app/ui/invoices/table';
import { CreateInvoice } from '@/app/ui/invoices/buttons';
import { lusitana } from '@/app/ui/fonts';
import {
  InvoicesTableSkeleton,
  PaginationSkeleton,
} from '@/app/ui/skeletons';
import { Suspense } from 'react';
import { fetchInvoicesPages } from '@/app/lib/data';
import { parseInvoiceSort } from '@/app/lib/invoice-sort';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoices',
};

export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) || 1;
  const sort = parseInvoiceSort(searchParams?.sort, searchParams?.dir);

  return (
    <div className="w-full">
      <div className="flex w-full items-center justify-between">
        <h1 className={`${lusitana.className} text-2xl`}>Invoices</h1>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search invoices..." />
        <CreateInvoice />
      </div>
      <Suspense
        key={`${query}-${currentPage}-${sort?.column ?? ''}-${sort?.direction ?? ''}`}
        fallback={<InvoicesTableSkeleton />}
      >
        <Table query={query} currentPage={currentPage} sort={sort} />
      </Suspense>
      <div className="mt-5 flex w-full justify-center">
        {/* The page-count COUNT(*) streams on its own so the page shell (and
            the table skeleton above) paints without waiting for it. Keyed by
            query only — page/sort changes don't alter the count, so the
            rendered pagination stays on screen instead of flashing a
            fallback during those navigations. */}
        <Suspense key={query} fallback={<PaginationSkeleton />}>
          <InvoicesPagination query={query} />
        </Suspense>
      </div>
    </div>
  );
}

async function InvoicesPagination({ query }: { query: string }) {
  const totalPages = await fetchInvoicesPages(query);
  return <Pagination totalPages={totalPages} />;
}
