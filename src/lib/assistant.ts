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

interface AssistantChatResponse {
  ok: boolean;
  reply?: string;
  pendingAction?: ResolvedCreateExpenseAction;
  error?: string;
  message?: string;
}

interface AssistantExecuteResponse {
  ok: boolean;
  executed?: boolean;
  expense_id?: string;
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
  pendingAction?: ResolvedCreateExpenseAction;
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
export async function executeAssistantAction(action: ResolvedCreateExpenseAction): Promise<string> {
  const { data, error } = await supabase.functions.invoke<AssistantExecuteResponse>("assistant-chat", {
    body: { mode: "execute_action", action },
  });
  if (error) throw new AssistantError(error.message);
  if (!data?.ok || !data.executed) {
    throw new AssistantError(data?.message ?? "That couldn't be saved.", data?.error);
  }
  return data.expense_id!;
}
