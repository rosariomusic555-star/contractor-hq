import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, fireEvent } from "@testing-library/react";
import { parseDecimal } from "./parseDecimal";
import { DecimalInput } from "@/components/common/DecimalInput";

// Settings bugs (2026-09-28): "1.5" typed into Overtime pay became 15 (the
// dot was dropped as you typed — a 15× multiplier then saved), and "1,200"
// in Overhead saved as $0.
describe("parseDecimal", () => {
  it("reads commas, $ and decimals; blank is null", () => {
    expect(parseDecimal("1,200")).toBe(1200);
    expect(parseDecimal("$1,200.50")).toBe(1200.5);
    expect(parseDecimal("1.5")).toBe(1.5);
    expect(parseDecimal("1.")).toBe(1);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
});

function Harness({ onValue }: { onValue: (v: number | null) => void }) {
  const [v, setV] = useState<number | null>(2);
  return <DecimalInput aria-label="ot" value={v} onChange={(n) => { setV(n); onValue(n); }} />;
}

describe("DecimalInput keeps what's typed", () => {
  it("typing 1 . 5 gives 1.5, not 15", () => {
    const seen = vi.fn();
    const r = render(<Harness onValue={seen} />);
    const input = r.getByLabelText("ot") as HTMLInputElement;
    for (const text of ["", "1", "1.", "1.5"]) fireEvent.change(input, { target: { value: text } });
    expect(input.value).toBe("1.5");
    expect(seen).toHaveBeenLastCalledWith(1.5);
  });
});
