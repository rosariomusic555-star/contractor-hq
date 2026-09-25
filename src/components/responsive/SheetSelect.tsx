import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { BottomSheet, SheetRow } from "./BottomSheet";

export interface SheetSelectOption {
  value: string;
  label: string;
  /** Draw a divider above this option. */
  separatorBefore?: boolean;
}

/**
 * A dropdown that is a normal Radix Select on desktop and a bottom sheet of
 * big tap rows on phones — the builders' unit / category / project type /
 * sort pickers. `renderTrigger` customises what the closed control shows
 * (e.g. a chip); by default it's the selected label.
 */
export function SheetSelect({
  value,
  onValueChange,
  options,
  placeholder,
  title,
  ariaLabel,
  triggerClassName,
  renderTrigger,
  disabled,
  footer,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SheetSelectOption[];
  placeholder?: string;
  /** Bottom sheet heading on phones. */
  title: string;
  ariaLabel: string;
  triggerClassName?: string;
  renderTrigger?: (selected: SheetSelectOption | undefined) => ReactNode;
  disabled?: boolean;
  /** Extra content under the options (e.g. a hint when the list is empty). */
  footer?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            !renderTrigger &&
              "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-base",
            triggerClassName,
          )}
        >
          {renderTrigger ? (
            renderTrigger(selected)
          ) : (
            <>
              <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
            </>
          )}
        </button>
        <BottomSheet open={open} onOpenChange={setOpen} title={title}>
          <div className="space-y-0.5">
            {options.map((o) => (
              <div key={o.value}>
                {o.separatorBefore && <div className="my-1.5 border-t border-hairline" />}
                <SheetRow
                  selected={o.value === value}
                  onClick={() => {
                    onValueChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </SheetRow>
              </div>
            ))}
          </div>
          {footer}
        </BottomSheet>
      </>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={triggerClassName}>
        {renderTrigger ? renderTrigger(selected) : <SelectValue placeholder={placeholder} />}
      </SelectTrigger>
      <SelectContent className="z-50">
        {options.map((o) => (
          <div key={o.value}>
            {o.separatorBefore && <SelectSeparator />}
            <SelectItem value={o.value}>{o.label}</SelectItem>
          </div>
        ))}
        {footer}
      </SelectContent>
    </Select>
  );
}
