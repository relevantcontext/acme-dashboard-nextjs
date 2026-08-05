import Pagination from '@/app/ui/invoices/pagination';
import Search from '@/app/ui/search';
import CustomersTable from '@/app/ui/customers/table';
import { lusitana } from '@/app/ui/fonts';
import {
  CustomersTableSkeleton,
  PaginationSkeleton,
} from '@/app/ui/skeletons';
import { Suspense } from 'react';
import { fetchCustomersPages } from '@/app/lib/data';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customers',
};

export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) || 1;

  return (
    <div className="w-full">
      <h1 className={`${lusitana.className} mb-8 text-xl md:text-2xl`}>
        Customers
      </h1>
      <Search placeholder="Search customers..." />
      <Suspense key={`${query}-${currentPage}`} fallback={<CustomersTableSkeleton />}>
        <CustomersTable query={query} currentPage={currentPage} />
      </Suspense>
      <div className="mt-5 flex w-full justify-center">
        {/* Same convention as the invoices page: the COUNT(*) streams on its
            own, keyed by query only, so paging keeps the rendered pagination
            on screen instead of flashing a fallback. */}
        <Suspense key={query} fallback={<PaginationSkeleton />}>
          <CustomersPagination query={query} />
        </Suspense>
      </div>
    </div>
  );
}

async function CustomersPagination({ query }: { query: string }) {
  const totalPages = await fetchCustomersPages(query);
  return <Pagination totalPages={totalPages} />;
}
