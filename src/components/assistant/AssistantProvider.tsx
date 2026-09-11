import { useCallback, useState, type ReactNode } from "react";
import { AssistantError, executeAssistantAction, sendAssistantMessage, type AssistantApiMessage } from "@/lib/assistant";
import { AssistantContext, type AssistantMessage } from "./assistant-context";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Conversation state lives only in memory — nothing here is persisted.
 * Refreshing or navigating away clears the thread (no server-side storage
 * of question/answer content — see supabase/migrations/0029). The richer
 * pendingAction structure on a message is a client-only concern too: what
 * actually gets sent back to Anthropic for conversation history is always
 * just the plain {role, content} text (see ask() below) — confirming or
 * cancelling a card never re-enters the model's context.
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
        const { reply, pendingAction } = await sendAssistantMessage(history);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: reply,
            pendingAction: pendingAction ? { action: pendingAction, status: "pending" } : undefined,
          },
        ]);
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

  const confirmAction = useCallback(
    async (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target?.pendingAction || target.pendingAction.status !== "pending" || pending) return;

      setPending(true);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.pendingAction
            ? { ...m, pendingAction: { ...m.pendingAction, status: "confirming" } }
            : m,
        ),
      );
      try {
        await executeAssistantAction(target.pendingAction.action);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.pendingAction
              ? { ...m, pendingAction: { ...m.pendingAction, status: "confirmed" } }
              : m,
          ),
        );
      } catch (err) {
        const error = err instanceof AssistantError ? err.message : "Something went wrong saving that.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.pendingAction
              ? { ...m, pendingAction: { ...m.pendingAction, status: "failed", error } }
              : m,
          ),
        );
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  // Purely local — nothing was ever attempted, so nothing to undo or log.
  const cancelAction = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.pendingAction
          ? { ...m, pendingAction: { ...m.pendingAction, status: "cancelled" } }
          : m,
      ),
    );
  }, []);

  const reset = useCallback(() => setMessages([]), []);

  return (
    <AssistantContext.Provider value={{ open, setOpen, messages, pending, ask, confirmAction, cancelAction, reset }}>
      {children}
    </AssistantContext.Provider>
  );
}
