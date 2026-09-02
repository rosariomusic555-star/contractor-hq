import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
export type ProjectType = "renovation" | "new_construction" | "repair" | "maintenance";
export type ExpenseCategory =
  | "materials"
  | "labor"
  | "subcontractor"
  | "equipment"
  | "permits"
  | "other";

export interface Quote {
  id: string;
  number: string;
  client: string;
  project: string | null;
  amount: number;
  status: QuoteStatus;
  issue_date: string;
  valid_until: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  number: string;
  client: string;
  project: string | null;
  amount: number;
  status: InvoiceStatus;
  project_type: ProjectType | null;
  issue_date: string;
  due_date: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory | null;
  project: string | null;
  amount: number;
  expense_date: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (days: number) => isoDate(new Date(Date.now() + days * 86_400_000));

/** Next sequential document number, e.g. "QT-005", derived from existing rows. */
async function nextNumber(table: "quotes" | "invoices", prefix: string): Promise<string> {
  const { data, error } = await supabase.from(table).select("number");
  if (error) throw error;
  const max = (data ?? []).reduce((acc, row) => {
    const n = parseInt(String((row as { number: string }).number).replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export async function listQuotes(): Promise<Quote[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createQuote(input: {
  client: string;
  project: string;
  amount: number;
  validDays: number;
}): Promise<Quote> {
  const number = await nextNumber("quotes", "QT");
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      number,
      client: input.client,
      project: input.project,
      amount: input.amount,
      status: "draft",
      issue_date: isoDate(new Date()),
      valid_until: daysFromNow(input.validDays),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function listInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createInvoice(input: {
  client: string;
  project: string;
  amount: number;
  dueDays: number;
  projectType?: ProjectType | null;
}): Promise<Invoice> {
  const number = await nextNumber("invoices", "INV");
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      number,
      client: input.client,
      project: input.project,
      amount: input.amount,
      status: "draft",
      project_type: input.projectType ?? null,
      issue_date: isoDate(new Date()),
      due_date: daysFromNow(input.dueDays),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createClient(input: {
  name: string;
  email: string;
  phone: string;
  address: string;
}): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}
