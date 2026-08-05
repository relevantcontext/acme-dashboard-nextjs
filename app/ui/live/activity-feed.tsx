'use client';

import Image from 'next/image';
import clsx from 'clsx';
import { BoltIcon } from '@heroicons/react/24/outline';
import { lusitana } from '@/app/ui/fonts';
import { formatCurrency } from '@/app/lib/utils';
import { useLiveEvents } from '@/app/ui/live/live-events-provider';

/**
 * Live payment activity feed for the dashboard overview.
 *
 * Renders the events delivered over the SSE stream, newest first, exactly as
 * they happen — who, what, amount, when. Purely a consumer of
 * LiveEventsProvider: the same events that paint a row here also trigger the
 * router.refresh() that moves the cards above it, so the feed and the cards
 * always tell the same story.
 */
export default function LiveActivityFeed() {
  const { events, isLive } = useLiveEvents();

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center gap-3">
        <h2 className={`${lusitana.className} mb-4 text-xl md:text-2xl`}>
          Live Activity
        </h2>
        <span
          className={clsx(
            'mb-4 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs',
            isLive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
          )}
        >
          <span
            className={clsx(
              'h-2 w-2 rounded-full',
              isLive ? 'animate-pulse bg-green-500' : 'bg-gray-400',
            )}
          />
          {isLive ? 'Live' : 'Connecting…'}
        </span>
      </div>
      <div className="flex grow flex-col rounded-xl bg-gray-50 p-4">
        {events.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-white px-6 py-8 text-sm text-gray-500">
            <BoltIcon className="h-5 w-5 text-gray-400" />
            Waiting for payment activity…
          </div>
        ) : (
          <div
            className="max-h-96 overflow-y-auto rounded-md bg-white px-6"
            aria-live="polite"
            aria-label="Live payment activity, newest first"
          >
            {events.map((event, i) => (
              <div
                key={event.id}
                className={clsx(
                  'flex flex-row items-center justify-between gap-3 py-3',
                  { 'border-t': i !== 0 },
                )}
              >
                <div className="flex min-w-0 items-center">
                  <Image
                    src={event.customer_image_url}
                    alt={`${event.customer_name}'s profile picture`}
                    className="mr-3 rounded-full"
                    width={28}
                    height={28}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {event.customer_name}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {event.type === 'invoice_paid'
                        ? 'paid an invoice'
                        : 'received a new invoice'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <p
                    className={clsx(
                      `${lusitana.className} text-sm font-medium`,
                      event.type === 'invoice_paid'
                        ? 'text-green-600'
                        : 'text-gray-900',
                    )}
                  >
                    {event.type === 'invoice_paid' ? '+' : ''}
                    {formatCurrency(event.amount)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(event.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
