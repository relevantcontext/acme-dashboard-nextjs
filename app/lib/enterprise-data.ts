// The enterprise fixture: a few hundred invoices across a few dozen customers.
//
// ── Why this exists next to placeholder-data.ts rather than replacing it ────
//
// The two sets answer different questions and must not be merged.
//
//   placeholder-data.ts  a FIDELITY artifact. Verbatim next-learn — 1 user,
//                        6 customers, 13 invoices, 12 revenue months. Its value
//                        is being byte-for-byte what the tutorial ships, so any
//                        difference between the two apps on it is a difference
//                        the apps caused.
//
//   enterprise-data.ts   a MEASUREMENT artifact. Large enough that the two
//                        architectures stop looking alike: the SpyneJS side
//                        ships every invoice once in /api/bootstrap and filters
//                        in the browser, while Next.js re-queries SQL for six
//                        rows per keystroke. At thirteen invoices that
//                        difference is invisible. At five hundred it is the
//                        measurement.
//
// ── Deterministic on purpose ────────────────────────────────────────────────
//
// Every id, name, amount, date and status is derived from a fixed seed, so
// seeding twice produces byte-identical databases — including invoice UUIDs.
//
// That is deliberately UNLIKE the original set, where seedInvoices inserts
// without an id and lets uuid_generate_v4() assign one. Two independent seeds
// of placeholder-data therefore agree on content and disagree on invoice ids,
// which is why the hosted comparison branches one seeded database rather than
// seeding two (see infra/DEPLOY.md).
//
// This set removes that constraint for itself: seed it anywhere and the ids
// match, so a recorded step — delete THIS invoice, edit THAT one — is portable
// between local, Vercel and AWS.
//
// No dependency is added for any of it. The PRNG is a 32-bit xorshift and the
// UUIDs are formatted from its output, both a few lines below.

import { revenue } from './placeholder-data';

const CUSTOMER_COUNT = 40;
const INVOICE_COUNT = 500;

// Fixed seed. Changing this changes every generated row, so treat it as part of
// the fixture's identity rather than as a knob.
const SEED = 0x5f3759df;

/** xorshift32 — same sequence on every platform and every Node version. */
function makeRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 0xffffffff;
  };
}

/**
 * A UUID built from the generator rather than from randomness, so the same seed
 * yields the same ids. Version and variant nibbles are set so Postgres accepts
 * it as a well-formed v4.
 */
function makeUuid(random: () => number) {
  const hex = '0123456789abcdef';
  let out = '';

  for (let i = 0; i < 32; i += 1) {
    if (i === 12) {
      out += '4';
    } else if (i === 16) {
      out += hex[(Math.floor(random() * 16) & 0x3) | 0x8];
    } else {
      out += hex[Math.floor(random() * 16)];
    }
  }

  return [
    out.slice(0, 8),
    out.slice(8, 12),
    out.slice(12, 16),
    out.slice(16, 20),
    out.slice(20),
  ].join('-');
}

const FIRST_NAMES = [
  'Amy', 'Balazs', 'Delba', 'Evil', 'Lee', 'Michael', 'Priya', 'Tomas',
  'Ingrid', 'Kwame', 'Sofia', 'Hiroshi', 'Nadia', 'Olumide', 'Freya', 'Diego',
  'Anika', 'Mateo', 'Yara', 'Sven',
];

const LAST_NAMES = [
  'Burns', 'Orban', 'de Oliveira', 'Rabbit', 'Robinson', 'Novotny', 'Sharma',
  'Novak', 'Lindqvist', 'Mensah', 'Rossi', 'Tanaka', 'Haddad', 'Adeyemi',
  'Nilsen', 'Marquez', 'Patel', 'Silva', 'Khoury', 'Eriksson',
];

// The six images the repo actually ships, cycled. A generated customer pointing
// at a file that does not exist would render a broken avatar in both apps and
// be misread as a rendering bug.
const IMAGES = [
  '/customers/amy-burns.png',
  '/customers/balazs-orban.png',
  '/customers/delba-de-oliveira.png',
  '/customers/evil-rabbit.png',
  '/customers/lee-robinson.png',
  '/customers/michael-novotny.png',
];

const random = makeRandom(SEED);

export const enterpriseCustomers = Array.from(
  { length: CUSTOMER_COUNT },
  (_, i) => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    // Stride by a number coprime with the list length so surnames cycle fully
    // instead of repeating. `i / FIRST_NAMES.length` looked right and gave every
    // customer one of TWO surnames, which made a search for "orban" match half
    // the dataset — a fixture that cannot exercise a narrow filter.
    const last = LAST_NAMES[(i * 13) % LAST_NAMES.length];
    const name = `${first} ${last}`;

    return {
      id: makeUuid(random),
      name,
      // Index-suffixed so a generated address can never collide with another
      // first/last pairing, and never with a real inbox.
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g, '')}${i}@example.com`,
      image_url: IMAGES[i % IMAGES.length],
    };
  },
);

/**
 * Dates run backwards from a FIXED date, not from today.
 *
 * A fixture anchored on `new Date()` would produce a different database every
 * day, so a chart screenshot from last week would no longer match — and the
 * revenue panel would drift out of alignment with the twelve months the
 * original set hard-codes.
 */
const ANCHOR = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

export const enterpriseInvoices = Array.from({ length: INVOICE_COUNT }, (_, i) => {
  const customer = enterpriseCustomers[Math.floor(random() * CUSTOMER_COUNT)];
  // Cents, as the schema stores them — the same unit the original set uses and
  // the reason a search for "448" matches $448.00.
  const amount = Math.floor(random() * 99_000) + 1_000;
  const daysBack = Math.floor(random() * 730);

  return {
    id: makeUuid(random),
    customer_id: customer.id,
    amount,
    status: random() < 0.55 ? 'paid' : 'pending',
    date: new Date(ANCHOR - daysBack * DAY_MS).toISOString().slice(0, 10),
  };
});

// Unchanged from the original set: twelve months, the same figures. The revenue
// chart is not what this fixture is scaling, and holding it constant keeps the
// dashboard panel comparable across both sets.
export const enterpriseRevenue = revenue;

export const ENTERPRISE_COUNTS = {
  customers: CUSTOMER_COUNT,
  invoices: INVOICE_COUNT,
  revenue: revenue.length,
  users: 1,
};
