import { supabase } from "./supabase";

export interface AssistantApiMessage {
  role: "user" | "assistant";
  content: string;
}

interface AssistantChatResponse {
  ok: boolean;
  reply?: string;
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

/** Calls the read-only assistant-chat Edge Function. Throws AssistantError on any failure. */
export async function sendAssistantMessage(messages: AssistantApiMessage[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke<AssistantChatResponse>("assistant-chat", {
    body: { messages },
  });
  if (error) throw new AssistantError(error.message);
  if (!data?.ok || !data.reply) {
    throw new AssistantError(data?.message ?? "The assistant didn't return an answer.", data?.error);
  }
  return data.reply;
}
