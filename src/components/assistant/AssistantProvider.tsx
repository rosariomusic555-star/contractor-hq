import { useCallback, useState, type ReactNode } from "react";
import { AssistantError, sendAssistantMessage, type AssistantApiMessage } from "@/lib/assistant";
import { AssistantContext, type AssistantMessage } from "./assistant-context";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Conversation state lives only in memory — nothing here is persisted.
 * Refreshing or navigating away clears the thread (no server-side storage
 * of question/answer content — see supabase/migrations/0029).
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      const userMessage: AssistantMessage = { id: uid(), role: "user", content: question };
      const history: AssistantApiMessage[] = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, userMessage]);
      setPending(true);
      try {
        const reply = await sendAssistantMessage(history);
        setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: reply }]);
      } catch (err) {
        const message =
          err instanceof AssistantError ? err.message : "Something went wrong reaching the assistant.";
        setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: message }]);
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  const reset = useCallback(() => setMessages([]), []);

  return (
    <AssistantContext.Provider value={{ open, setOpen, messages, pending, ask, reset }}>
      {children}
    </AssistantContext.Provider>
  );
}
