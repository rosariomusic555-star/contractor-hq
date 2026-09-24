import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn Input, plus two app-wide behaviors for type="number" (hand-added —
 * keep them if this file is ever regenerated):
 *
 * 1. No placeholder zeros. A value of 0 shows as an empty field with a grey
 *    "0" placeholder, so there's nothing to delete before typing. Once the
 *    user types, exactly what they typed is shown (so "0.5" still works);
 *    it goes back to empty-looking on blur if the value is still 0. Callers
 *    already treat an empty field as 0.
 * 2. No scroll-to-change. A wheel/trackpad scroll over a focused number
 *    input blurs it instead of nudging the value, so the page scrolls.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, placeholder, onChange, onBlur, onWheel, ...props }, ref) => {
    const isNumber = type === "number";
    const [typing, setTyping] = React.useState(false);
    const hideZero =
      isNumber && !typing && value !== undefined && value !== null && String(value).trim() !== "" && Number(value) === 0;

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        value={hideZero ? "" : value}
        placeholder={placeholder ?? (isNumber ? "0" : undefined)}
        onChange={(e) => {
          if (isNumber) setTyping(true);
          onChange?.(e);
        }}
        onBlur={(e) => {
          if (isNumber) setTyping(false);
          onBlur?.(e);
        }}
        onWheel={(e) => {
          if (isNumber && document.activeElement === e.currentTarget) e.currentTarget.blur();
          onWheel?.(e);
        }}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
