import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send, Sparkles } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssistant } from "./assistant-context";
import { AssistantActionCard } from "./AssistantActionCard";

const EXAMPLE_PROMPTS = [
  "Which quotes haven't I followed up on?",
  "What's my margin on my most recent job?",
  "How much have I spent on expenses this month?",
];

export function AssistantPanel() {
  const { open, setOpen, messages, pending, ask } = useAssistant();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open]);

  const submit = () => {
    if (!input.trim() || pending) return;
    const text = input;
    setInput("");
    void ask(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        className="flex h-[85vh] flex-col gap-0 rounded-t-card border-border p-0 md:inset-x-auto md:left-auto md:right-6 md:h-[70vh] md:w-[400px] md:rounded-card md:border"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold text-foreground">Ask about your business</h2>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-3">
              <p className="text-sm text-muted-foreground">
                Ask about your projects, quotes, invoices, or expenses. A few ideas:
              </p>
              <div className="space-y-2">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void ask(p)}
                    className="block w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                  {m.pendingAction && <AssistantActionCard messageId={m.id} pending={m.pendingAction} />}
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-hairline p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question…"
            rows={1}
            className="min-h-0 flex-1 resize-none py-2.5"
            disabled={pending}
          />
          <Button size="icon" onClick={submit} disabled={pending || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
