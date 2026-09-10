import { createContext, useContext } from "react";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AssistantContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AssistantMessage[];
  pending: boolean;
  ask: (text: string) => Promise<void>;
  reset: () => void;
}

export const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within an AssistantProvider");
  return ctx;
}
