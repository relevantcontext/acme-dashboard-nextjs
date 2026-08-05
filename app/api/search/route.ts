import { auth } from '@/auth';
import { searchCustomers, searchInvoices } from '@/app/lib/data';
import type { QuickSearchResults } from '@/app/lib/definitions';

/**
 * Global quick-search endpoint for the Cmd-K overlay.
 *
 * GET /api/search?q=<term> → { customers: [...], invoices: [...] }
 *
 * A Route Handler (not a Server Action) because typeahead is a read: GET
 * requests can run in parallel and be aborted client-side per keystroke,
 * whereas Server Actions are serialized POSTs meant for mutations.
 *
 * The auth proxy matcher deliberately excludes /api, so this handler performs
 * its own session check — it must never leak data to a signed-out client.
 * Route Handlers are dynamic (uncached) by default, which is exactly what a
 * live search wants.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';

  if (!query) {
    const empty: QuickSearchResults = { customers: [], invoices: [] };
    return Response.json(empty);
  }

  const [customers, invoices] = await Promise.all([
    searchCustomers(query),
    searchInvoices(query),
  ]);

  const results: QuickSearchResults = { customers, invoices };
  return Response.json(results);
}
