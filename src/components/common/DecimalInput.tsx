import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseDecimal } from "@/lib/parseDecimal";

/**
 * A number input that keeps what's typed ("1.", "0.0", "1,2") while the
 * parent holds the number — a field that re-rendered String(value) dropped
 * the dot, so "1.5" became "15". Blank = null. Resyncs only when the value
 * changes from outside (Discard, a reset).
 */
export function DecimalInput({
  value,
  onChange,
  ...rest
}: { value: number | null | undefined; onChange: (v: number | null) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? "" : String(value));
  useEffect(() => {
    if (parseDecimal(text) !== (value ?? null) && !(value != null && Number.isNaN(value))) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      {...rest}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseDecimal(e.target.value));
      }}
    />
  );
}
