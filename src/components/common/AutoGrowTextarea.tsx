import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A textarea that grows to fit its content — used for the line-item name /
 * description fields so a long paragraph wraps and stays fully visible
 * instead of scrolling horizontally in a single line. Starts at one row.
 */
export const AutoGrowTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, value, onInput, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  const resize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Re-fit whenever the controlled value changes (typing, draft reseed, …).
  React.useLayoutEffect(resize, [value, resize]);

  return (
    <textarea
      ref={setRef}
      rows={1}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn(
        "flex min-h-9 w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-1.5 text-sm leading-snug ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
AutoGrowTextarea.displayName = "AutoGrowTextarea";
