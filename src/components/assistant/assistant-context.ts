import { createContext, useContext } from "react";
import type { ResolvedAction } from "@/lib/assistant";

export interface AssistantPendingAction {
  action: ResolvedAction;
  status: "pending" | "confirming" | "confirmed" | "cancelled" | "failed";
  error?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingAction?: AssistantPendingAction;
}

export interface AssistantContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AssistantMessage[];
  pending: boolean;
  ask: (text: string) => Promise<void>;
  confirmAction: (messageId: string) => Promise<void>;
  cancelAction: (messageId: string) => void;
  reset: () => void;
}

export const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within an AssistantProvider");
  return ctx;
}
