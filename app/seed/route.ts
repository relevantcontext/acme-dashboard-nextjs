import bcrypt from 'bcrypt';
import postgres from 'postgres';
import { invoices, customers, revenue, users } from '../lib/placeholder-data';
import {
  enterpriseCustomers,
  enterpriseInvoices,
  enterpriseRevenue,
} from '../lib/enterprise-data';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// ── Two fixtures, one seeder ────────────────────────────────────────────────
//
// GET /seed                  the next-learn fixture, unchanged
// GET /seed?set=enterprise   a few hundred invoices across a few dozen customers
//
// The route stays the single canonical place that owns the schema for BOTH
// apps — infra/reset-db.sh deliberately contains no INSERTs of its own — so a
// second fixture is a second data source here, not a second seeder somewhere
// else.
//
// The only structural difference between the two: enterprise invoices carry
// explicit ids so the set is reproducible, while the original lets
// uuid_generate_v4() assign them, exactly as next-learn does. seedInvoices
// below is the one place that has to know.

type SeedSet = {
  customers: typeof customers;
  invoices: Array<{
    id?: string;
    customer_id: string;
    amount: number;
    status: string;
    date: string;
  }>;
  revenue: typeof revenue;
};

const SETS: Record<string, SeedSet> = {
  default: { customers, invoices, revenue },
  enterprise: {
    customers: enterpriseCustomers,
    invoices: enterpriseInvoices,
    revenue: enterpriseRevenue,
  },
};

async function seedUsers() {
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `;

  const insertedUsers = await Promise.all(
    users.map(async (user) => {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      return sql`
        INSERT INTO users (id, name, email, password)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${hashedPassword})
        ON CONFLICT (id) DO NOTHING;
      `;
    }),
  );

  return insertedUsers;
}

async function seedInvoices(set: SeedSet) {
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      customer_id UUID NOT NULL,
      amount INT NOT NULL,
      status VARCHAR(255) NOT NULL,
      date DATE NOT NULL
    );
  `;

  const insertedInvoices = await Promise.all(
    set.invoices.map((invoice) =>
      // An id is supplied by the enterprise set and omitted by the original, so
      // the column list differs. Written as two statements rather than one with
      // a COALESCE so the original path stays exactly what next-learn ships.
      invoice.id
        ? sql`
        INSERT INTO invoices (id, customer_id, amount, status, date)
        VALUES (${invoice.id}, ${invoice.customer_id}, ${invoice.amount}, ${invoice.status}, ${invoice.date})
        ON CONFLICT (id) DO NOTHING;
      `
        : sql`
        INSERT INTO invoices (customer_id, amount, status, date)
        VALUES (${invoice.customer_id}, ${invoice.amount}, ${invoice.status}, ${invoice.date})
        ON CONFLICT (id) DO NOTHING;
      `,
    ),
  );

  return insertedInvoices;
}

async function seedCustomers(set: SeedSet) {
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      image_url VARCHAR(255) NOT NULL
    );
  `;

  const insertedCustomers = await Promise.all(
    set.customers.map(
      (customer) => sql`
        INSERT INTO customers (id, name, email, image_url)
        VALUES (${customer.id}, ${customer.name}, ${customer.email}, ${customer.image_url})
        ON CONFLICT (id) DO NOTHING;
      `,
    ),
  );

  return insertedCustomers;
}

async function seedRevenue(set: SeedSet) {
  await sql`
    CREATE TABLE IF NOT EXISTS revenue (
      month VARCHAR(4) NOT NULL UNIQUE,
      revenue INT NOT NULL
    );
  `;

  const insertedRevenue = await Promise.all(
    set.revenue.map(
      (rev) => sql`
        INSERT INTO revenue (month, revenue)
        VALUES (${rev.month}, ${rev.revenue})
        ON CONFLICT (month) DO NOTHING;
      `,
    ),
  );

  return insertedRevenue;
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('set') ?? 'default';
  const set = SETS[requested];

  if (!set) {
    return Response.json(
      { error: `Unknown seed set "${requested}". Use default or enterprise.` },
      { status: 400 },
    );
  }

  try {
    await sql.begin((sql) => [
      seedUsers(),
      seedCustomers(set),
      seedInvoices(set),
      seedRevenue(set),
    ]);

    return Response.json({
      message: 'Database seeded successfully',
      set: requested,
      counts: {
        users: users.length,
        customers: set.customers.length,
        invoices: set.invoices.length,
        revenue: set.revenue.length,
      },
    });
  } catch (error) {
    return Response.json({ error }, { status: 500 });
  }
}
