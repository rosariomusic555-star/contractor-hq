import { Sparkles } from "lucide-react";
import { useAssistant } from "./assistant-context";

/**
 * Floating entry point for the AI assistant, reachable from any screen.
 * Sits above the mobile bottom tab bar (safe-area aware, same offset
 * technique as BottomTabBar's own padding) and lower-right on desktop,
 * where there's no tab bar to clear.
 */
export function AssistantButton() {
  const { open, setOpen } = useAssistant();
  if (open) return null;

  return (
    <button
      type="button"
      aria-label="Ask AI assistant"
      onClick={() => setOpen(true)}
      className="fab-lift fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:right-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6"
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}
