import { compressImageFile } from "./imageUpload";
import { supabase } from "./supabase";

export interface AssistantApiMessage {
  role: "user" | "assistant";
  content: string;
}

/** Mirrors ResolvedCreateExpenseAction in supabase/functions/assistant-chat/tools.ts. */
export interface ResolvedCreateExpenseAction {
  type: "create_expense";
  project_id: string;
  project_name: string;
  name: string;
  amount: number;
  expense_category_id: string | null;
  category_name: string | null;
  date: string;
  date_was_defaulted: boolean;
}

/** Mirrors ResolvedCreateTaskAction in supabase/functions/assistant-chat/tools.ts (CRM Phase 7). */
export interface ResolvedCreateTaskAction {
  type: "create_task";
  title: string;
  client_id: string | null;
  client_name: string | null;
  opportunity_id: string | null;
  opportunity_title: string | null;
  due_date: string | null;
  task_type: string;
  priority: string;
}

export type ResolvedAction = ResolvedCreateExpenseAction | ResolvedCreateTaskAction;

interface AssistantChatResponse {
  ok: boolean;
  reply?: string;
  pendingAction?: ResolvedAction;
  error?: string;
  message?: string;
}

interface AssistantExecuteResponse {
  ok: boolean;
  executed?: boolean;
  expense_id?: string;
  task_id?: string;
  error?: string;
  message?: string;
}

/** Thrown for both transport failures and the function's own {ok:false} replies (rate limit, etc). */
export class AssistantError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export interface AssistantReply {
  reply: string;
  pendingAction?: ResolvedAction;
}

/** Calls the assistant-chat Edge Function in chat mode. Throws AssistantError on any failure. */
export async function sendAssistantMessage(messages: AssistantApiMessage[]): Promise<AssistantReply> {
  const { data, error } = await supabase.functions.invoke<AssistantChatResponse>("assistant-chat", {
    body: { mode: "chat", messages },
  });
  if (error) throw new AssistantError(error.message);
  if (!data?.ok || !data.reply) {
    throw new AssistantError(data?.message ?? "The assistant didn't return an answer.", data?.error);
  }
  return { reply: data.reply, pendingAction: data.pendingAction };
}

/**
 * Executes a previously-proposed write action — only ever called from a
 * user tapping Confirm on an AssistantActionCard. Never invoked as a side
 * effect of anything the model says; see index.ts's top comment for why
 * this is architecturally separate from the chat path.
 */
export async function executeAssistantAction(action: ResolvedAction): Promise<string> {
  const { data, error } = await supabase.functions.invoke<AssistantExecuteResponse>("assistant-chat", {
    body: { mode: "execute_action", action },
  });
  if (error) throw new AssistantError(error.message);
  if (!data?.ok || !data.executed) {
    throw new AssistantError(data?.message ?? "That couldn't be saved.", data?.error);
  }
  return (data.expense_id ?? data.task_id)!;
}

interface GenerateDescriptionResponse {
  ok: boolean;
  description?: string;
  error?: string;
  message?: string;
}

/**
 * Quick Quote's AI-written line-item description — a single-shot, no-tools
 * call sharing the assistant-chat function's Anthropic client/key and
 * per-user rate limit, not a separate integration. Callers should race
 * this against their own timeout and fall back to a templated description
 * (see src/lib/quickQuote/*.ts fallbackDescription) rather than block the
 * flow indefinitely — this function itself has no timeout of its own.
 */
export async function generateQuoteLineDescription(input: {
  buildTypeLabel: string;
  answers: Record<string, string>;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke<GenerateDescriptionResponse>("assistant-chat", {
    body: { mode: "generate_quote_description", buildType: input.buildTypeLabel, answers: input.answers },
  });
  if (error) throw new AssistantError(error.message);
  if (!data?.ok || !data.description) {
    throw new AssistantError(data?.message ?? "The assistant didn't return a description.", data?.error);
  }
  return data.description;
}

export interface ExtractedReceipt {
  supplier: string | null;
  date: string | null;
  total: number | null;
  lines: { description: string; quantity: number | null; unit: string | null; unit_price: number | null }[];
}

interface ExtractReceiptResponse {
  ok: boolean;
  receipt?: ExtractedReceipt;
  error?: string;
  message?: string;
}

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Reads a supplier receipt/invoice (photo or PDF) into delivery lines via
 * the assistant-chat function's "extract_receipt" mode. Photos are shrunk
 * first (receipts stay legible at 2000px). Read-only — the caller shows the
 * result in an editable review step; nothing is saved here.
 */
export async function extractReceipt(file: File): Promise<ExtractedReceipt> {
  const isPdf = file.type === "application/pdf";
  const blob = isPdf ? file : await compressImageFile(file, { maxDimension: 2000, quality: 0.85 });
  const mediaType = isPdf ? "application/pdf" : "image/jpeg";
  const { data, error } = await supabase.functions.invoke<ExtractReceiptResponse>("assistant-chat", {
    body: { mode: "extract_receipt", file: await blobToBase64(blob), mediaType },
  });
  if (error) throw new AssistantError(error.message);
  if (!data?.ok || !data.receipt) throw new AssistantError(data?.message ?? "Couldn't read that receipt.", data?.error);
  return { ...data.receipt, lines: data.receipt.lines ?? [] };
}
