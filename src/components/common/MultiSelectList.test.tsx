import { describe, it, expect, vi, beforeAll } from "vitest";
import { useState } from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { MultiSelectList, type MultiSelectOption } from "./MultiSelectList";

beforeAll(() => {
  // cmdk scrolls the active item into view and observes size.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const OPTIONS: MultiSelectOption[] = [
  { id: "fp", label: "Fire Pit" },
  { id: "ok", label: "Outdoor Kitchen" },
  { id: "lt", label: "Outdoor Lighting" },
];

function Harness(props: { initial?: string[]; exclusive?: boolean; bulk?: boolean; options?: MultiSelectOption[]; onDone?: () => void }) {
  const [value, setValue] = useState<string[]>(props.initial ?? []);
  return (
    <>
      <MultiSelectList
        options={props.options ?? OPTIONS}
        value={value}
        onChange={setValue}
        exclusive={props.exclusive ? { id: "__general__", label: "General", hint: "not tied to a feature" } : undefined}
        bulk={props.bulk}
        onDone={props.onDone ?? (() => undefined)}
      />
      <output data-testid="value">{value.join(",")}</output>
    </>
  );
}

const row = (label: string) => screen.getByText(label).closest("[cmdk-item]") as HTMLElement;
const value = () => screen.getByTestId("value").textContent;
const checkedState = (label: string) => row(label).querySelector("button[role=checkbox]")?.getAttribute("data-state");

describe("MultiSelectList", () => {
  it("every row has a checkbox square; clicking toggles", () => {
    render(<Harness />);
    expect(checkedState("Fire Pit")).toBe("unchecked");
    fireEvent.click(row("Fire Pit"));
    fireEvent.click(row("Outdoor Kitchen"));
    expect(value()).toBe("fp,ok");
    expect(checkedState("Fire Pit")).toBe("checked");
    fireEvent.click(row("Fire Pit"));
    expect(value()).toBe("ok");
  });

  it("says it's multi-select and counts the selection", () => {
    render(<Harness initial={["fp", "ok"]} />);
    expect(screen.getByText("Select all that apply")).toBeTruthy();
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("Done calls onDone (the popover / sheet closes)", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("the exclusive option: checked when nothing else is, clears the rest, unchecked by any pick", () => {
    render(<Harness exclusive initial={["fp", "ok"]} />);
    expect(checkedState("General")).toBe("unchecked");
    fireEvent.click(row("General"));
    expect(value()).toBe("");
    expect(checkedState("General")).toBe("checked");
    fireEvent.click(row("Outdoor Lighting"));
    expect(value()).toBe("lt");
    expect(checkedState("General")).toBe("unchecked");
    fireEvent.click(row("Outdoor Lighting"));
    expect(checkedState("General")).toBe("checked");
  });

  it("Select all / Clear only for bulk lists longer than 5", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, label: `Material ${i}` }));
    const { unmount } = render(<Harness bulk options={many} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(value()).toBe("m0,m1,m2,m3,m4,m5");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(value()).toBe("");
    unmount();
    render(<Harness bulk />);
    expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
  });

  it("Space toggles the highlighted row", () => {
    render(<Harness />);
    const list = row("Fire Pit").closest("[cmdk-root]") as HTMLElement;
    fireEvent.keyDown(list, { key: " " });
    expect(value()).toBe("fp");
  });
});
