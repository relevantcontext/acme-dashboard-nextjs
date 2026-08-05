'use server';

import { z } from 'zod';
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ date: true, id: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

// Every page that renders data derived from invoices. After ANY invoice
// mutation (create, edit, delete, status toggle) we revalidate all of them so
// no surface — dashboard cards, latest invoices, the invoices table and its
// pagination counts, the per-customer invoice aggregates, or a cached edit
// form — can serve stale values. Calling revalidatePath inside a Server
// Action also purges the client-side router cache, which covers views reached
// via back/forward navigation or by navigating away and back.
function revalidateInvoiceSurfaces() {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard/customers');
  revalidatePath('/dashboard/invoices/[id]/edit', 'page');
}

export async function createInvoice(prevState: State, formData: FormData) {
  // Validate form fields using Zod
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  // Insert data into the database
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    // If a database error occurs, return a more specific error.
    return {
      message: 'Database Error: Failed to Create Invoice.',
    };
  }

  // Revalidate every invoice-derived surface and redirect the user.
  revalidateInvoiceSurfaces();
  redirect('/dashboard/invoices');
}

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    return { message: 'Database Error: Failed to Update Invoice.' };
  }

  revalidateInvoiceSurfaces();
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  await sql`DELETE FROM invoices WHERE id = ${id}`;
  revalidateInvoiceSurfaces();
}

const ToggleInvoiceStatus = FormSchema.pick({ status: true });

/**
 * Inline status toggle for a single invoice row. The client passes the target
 * status (not "flip whatever is there") so the persisted result always matches
 * what the user saw when they clicked, even if rapid clicks queue up.
 */
export async function toggleInvoiceStatus(id: string, status: string) {
  const validated = ToggleInvoiceStatus.safeParse({ status });

  if (!validated.success) {
    throw new Error('Invalid status. Failed to Update Invoice Status.');
  }

  try {
    await sql`
      UPDATE invoices
      SET status = ${validated.data.status}
      WHERE id = ${id}
    `;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Database Error: Failed to Update Invoice Status.');
  }

  revalidateInvoiceSurfaces();
}

// One entry of the bulk-edit batch save. Only the fields the user actually
// edited are present; everything else is left alone by the UPDATE below.
const SaveInvoiceEdit = z.object({
  id: z.string().uuid(),
  fields: z
    .object({
      amount: z.number().int().gt(0).optional(), // cents
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      status: z.enum(['pending', 'paid']).optional(),
    })
    .refine(
      (fields) =>
        fields.amount !== undefined ||
        fields.date !== undefined ||
        fields.status !== undefined,
      { message: 'An edit must change at least one field.' },
    ),
});

export type SaveInvoiceEditsResult =
  | { ok: true; saved: number }
  | { ok: false; message: string };

/**
 * Batch save for the invoices table's bulk-edit mode: persists every unsaved
 * draft in ONE transaction.
 *
 * Concurrency contract: each UPDATE touches only the invoices the user
 * edited, and via COALESCE only the FIELDS they edited. Changes that arrived
 * from the live payment generator meanwhile — new invoices, or status flips
 * on invoices the user didn't touch — are never written over. Where the user
 * and an external event changed the SAME field of the SAME invoice, the
 * user's explicit edit wins (last write). Returned errors (instead of throws)
 * keep the client's drafts intact for retry.
 *
 * Reuses revalidateInvoiceSurfaces() so, exactly like every other invoice
 * mutation, all invoice-derived surfaces reflect the saved values immediately.
 */
export async function saveInvoiceEdits(
  edits: unknown,
): Promise<SaveInvoiceEditsResult> {
  const validated = z.array(SaveInvoiceEdit).min(1).max(1000).safeParse(edits);
  if (!validated.success) {
    return { ok: false, message: 'Invalid edits. Nothing was saved.' };
  }

  try {
    await sql.begin(async (tx) => {
      for (const edit of validated.data) {
        await tx`
          UPDATE invoices SET
            amount = COALESCE(${edit.fields.amount ?? null}::int, amount),
            date = COALESCE(${edit.fields.date ?? null}::date, date),
            status = COALESCE(${edit.fields.status ?? null}::varchar, status)
          WHERE id = ${edit.id}
        `;
      }
    });
  } catch (error) {
    console.error('Database Error:', error);
    return { ok: false, message: 'Database Error: Failed to save edits.' };
  }

  revalidateInvoiceSurfaces();
  return { ok: true, saved: validated.data.length };
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
