import { useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the Measurements cards. Mobile-first — these get
 * filled in on a phone at the job site: 48px-tall inputs, decimal keypad,
 * 44px+ tap targets everywhere.
 */

const parseNum = (text: string): number | null => {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return isFinite(v) && v >= 0 ? v : null;
};

/** A labelled number input with its unit inside the field. Keeps the typed
 * text locally so "12." or "0.5" can be typed without the value jumping. */
export function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  placeholder,
  className,
  labelClassName,
}: {
  id?: string;
  label: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  // Follow outside changes (Discard, switching instance) without clobbering
  // what's mid-typing: only resync when the parsed text disagrees.
  useEffect(() => {
    if (parseNum(text) !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className={cn("block space-y-1", className)}>
      <span className={cn("block text-xs font-semibold text-muted-foreground", labelClassName)}>{label}</span>
      <span className="relative block">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseNum(e.target.value));
          }}
          className={cn("h-12 text-base", suffix && "pr-14")}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      className={cn("h-12 text-base", className)}
    />
  );
}

/** Pill-style single choice (method, shape, layout…). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5 rounded-xl bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small secondary "+ Add …" text button. */
export function AddLink({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary hover:underline", className)}
    >
      <Plus className="h-4 w-4" />
      {children}
    </button>
  );
}

export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/** The calculated result under a set of inputs: "20 ft × 12 ft = 240 sq ft". */
export function Computed({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "rounded-lg px-3 py-2.5 text-sm font-semibold",
        muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs font-semibold text-warning">{children}</p>;
}

/** A bordered sub-row (a wall section, a step section, an irregular area). */
export function SubRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-2.5 rounded-xl border border-hairline bg-background p-3", className)}>{children}</div>;
}

/**
 * A height with a contractor default (fire pit, kitchen counter): collapsed
 * to "Height: 18 in · change" so a normal job never touches it; "change"
 * opens the input, "Use default" clears the override (null = default).
 */
export function DefaultableHeightField({
  value,
  defaultValue,
  onChange,
  label = "Height",
}: {
  value: number | null;
  defaultValue: number;
  onChange: (v: number | null) => void;
  label?: string;
}) {
  const [editing, setEditing] = useState(value != null);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground">
        {label}: <span className="font-semibold text-foreground">{defaultValue} in</span> ·{" "}
        <span className="font-bold text-primary hover:underline">change</span>
      </button>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <NumField label={label} suffix="in" placeholder={String(defaultValue)} value={value} onChange={onChange} className="flex-1" />
      <button
        type="button"
        onClick={() => {
          onChange(null);
          setEditing(false);
        }}
        className="min-h-12 shrink-0 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
      >
        Use default
      </button>
    </div>
  );
}
