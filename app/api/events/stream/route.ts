import { auth } from '@/auth';
import {
  fetchPaymentEventsSince,
  generatePaymentActivity,
  latestPaymentEventId,
} from '@/app/lib/payment-events';

/**
 * Server-Sent Events stream of real-time payment activity.
 *
 * GET /api/events/stream → text/event-stream of PaymentEvent JSON frames.
 *
 * ── Transport: why SSE over a Route Handler ────────────────────────────────
 *
 * The traffic is strictly server→client (events happen server-side; client
 * mutations already travel via Server Actions), which is exactly what SSE is
 * for. It runs over plain HTTP — no WebSocket infrastructure, which Vercel
 * functions don't host anyway — and streaming responses ARE supported on
 * Vercel within function-duration limits. The browser's EventSource handles
 * the duration limit for free: when the function hits maxDuration and the
 * connection drops, EventSource reconnects automatically and sends the
 * Last-Event-ID header, and this handler resumes the cursor from it — no
 * event is ever missed, because events are rows, not ephemeral messages.
 *
 * ── Generation is tied to the stream ───────────────────────────────────────
 *
 * Each connection ticks generatePaymentActivity() while open. That gives the
 * required lifecycle with no background scheduler (which serverless couldn't
 * keep alive): activity happens exactly while a signed-in user has the app
 * open, and stops when the last stream closes. Multi-connection over-
 * generation is prevented in the DB (advisory lock + cadence check — see
 * app/lib/payment-events.ts).
 *
 * The auth proxy matcher excludes /api, so like /api/search this handler
 * performs its own session check. Sign-out closes the client's EventSource
 * (the dashboard tree unmounts), and any later reconnect attempt gets a 401.
 */

// Vercel: cap the function at 300s (within Hobby/Pro fluid-compute limits).
// EventSource + Last-Event-ID makes the recycle seamless for the client.
export const maxDuration = 300;

// How often each open stream looks for (and, if due, generates) activity.
const TICK_MS = 2_000;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Resume from the client's last seen event on reconnect; otherwise start at
  // the current head — the feed shows what happens from now on, history is
  // already reflected in the persisted invoice data itself.
  const lastEventId = Number(request.headers.get('last-event-id'));
  const initialCursor = Number.isFinite(lastEventId) && lastEventId > 0
    ? lastEventId
    : await latestPaymentEventId();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = initialCursor;

      const send = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame));
          return true;
        } catch {
          return false; // client went away between abort check and write
        }
      };

      // Tell EventSource to wait 2s before reconnecting after a drop.
      send('retry: 2000\n\n');

      while (!request.signal.aborted) {
        await generatePaymentActivity();

        const events = await fetchPaymentEventsSince(cursor);
        let alive = true;
        for (const event of events) {
          cursor = event.id;
          alive = send(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
          if (!alive) break;
        }
        // Heartbeat comment on idle ticks keeps intermediaries from timing
        // out the connection and lets us notice a dead socket.
        if (events.length === 0) alive = send(': ping\n\n');
        if (!alive) break;

        await sleep(TICK_MS, request.signal);
      }

      try {
        controller.close();
      } catch {
        // already closed/errored — nothing to do
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
