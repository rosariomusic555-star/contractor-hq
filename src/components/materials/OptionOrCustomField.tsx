import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const OTHER = "__other__";

/**
 * A dropdown of fixed options plus "Other…", which swaps in a text box for
 * a custom value — the materials sheet's Unit and Color fields. A value
 * that isn't one of the options (a custom unit/color, or one saved before
 * the list existed) opens straight into the text box, so nothing is ever
 * hidden or lost. With no options at all it's just the text box.
 */
export function OptionOrCustomField({
  value,
  onChange,
  options,
  placeholder,
  customPlaceholder,
  otherLabel = "Other…",
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  customPlaceholder: string;
  otherLabel?: string;
  ariaLabel: string;
  className?: string;
}) {
  const isOption = options.includes(value);
  const [custom, setCustom] = useState(!isOption && value !== "");
  // Re-sync when the value changes from outside (a Catalog/Price Book pick,
  // the calculator, a discarded draft).
  useEffect(() => {
    if (options.includes(value)) setCustom(false);
    else if (value !== "") setCustom(true);
  }, [value, options]);

  if (options.length === 0 || custom) {
    return (
      <div className={cn("relative", className)}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={options.length === 0 ? placeholder : customPlaceholder}
          className={cn("h-[42px]", options.length > 0 && "pr-9")}
          aria-label={ariaLabel}
          autoFocus={custom && value === ""}
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              onChange("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-subtle hover:bg-muted hover:text-foreground"
            aria-label="Choose from the list instead"
            title="Choose from the list"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => {
        if (v === OTHER) {
          setCustom(true);
          onChange("");
        } else {
          onChange(v);
        }
      }}
    >
      <SelectTrigger className={cn("h-[42px]", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
        <SelectItem value={OTHER}>{otherLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}
