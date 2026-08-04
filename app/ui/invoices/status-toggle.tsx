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
 */
export default function StatusToggle({
  id,
  status,
}: {
  id: string;
  status: 'pending' | 'paid';
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();

  const nextStatus = optimisticStatus === 'paid' ? 'pending' : 'paid';

  function handleToggle() {
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      await toggleInvoiceStatus(id, nextStatus);
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
