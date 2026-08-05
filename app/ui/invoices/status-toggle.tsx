'use client';

import { useOptimistic, useTransition } from 'react';
import InvoiceStatus from '@/app/ui/invoices/status';
import { toggleInvoiceStatus } from '@/app/lib/actions';

/**
 * Inline paid/pending toggle for an invoice row.
 *
 * Renders the status badge as a button. Clicking it optimistically flips the
 * badge on the current frame (useOptimistic), then runs the Server Action in
 * a transition. When the action finishes, the revalidated server render
 * arrives with the persisted status and the optimistic value hands off to it.
 * If the action throws, the optimistic value reverts and the error surfaces
 * in the nearest error boundary.
 *
 * The next status is derived from the optimistic value (not the prop) so
 * rapid clicks toggle correctly instead of reading a stale closure.
 *
 * `onToggled` (optional) runs inside the same transition after the Server
 * Action succeeds. Hosts whose row data does not come from a server render —
 * e.g. the quick-search overlay, which fetches its list from /api/search —
 * use it to refetch so the prop the optimistic value settles back onto is the
 * persisted status. Awaiting it keeps the optimistic value on screen until
 * that refetch lands (no flicker back to the stale prop).
 */
export default function StatusToggle({
  id,
  status,
  onToggled,
}: {
  id: string;
  status: 'pending' | 'paid';
  onToggled?: () => void | Promise<void>;
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();

  const nextStatus = optimisticStatus === 'paid' ? 'pending' : 'paid';

  function handleToggle() {
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      await toggleInvoiceStatus(id, nextStatus);
      await onToggled?.();
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      role="switch"
      aria-checked={optimisticStatus === 'paid'}
      aria-label={`Invoice status: ${optimisticStatus}. Mark as ${nextStatus}.`}
      title={`Mark as ${nextStatus}`}
      data-pending={isPending || undefined}
      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 data-[pending]:opacity-60"
    >
      <InvoiceStatus status={optimisticStatus} />
    </button>
  );
}
