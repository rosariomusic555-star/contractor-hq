import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { withErrorBoundary } from "./withErrorBoundary";

function Boom({ open }: { open: boolean; onOpenChange?: (o: boolean) => void }): JSX.Element {
  if (open || !open) throw new Error("kaboom");
  return <div />;
}
const Safe = withErrorBoundary(Boom, "Boom");

describe("withErrorBoundary", () => {
  it("shows a closable 'Something went wrong' instead of crashing the page", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onOpenChange = vi.fn();
    render(
      <div>
        <p>page content</p>
        <Safe open onOpenChange={onOpenChange} />
      </div>,
    );
    expect(screen.getByText("page content")).toBeTruthy();
    expect(screen.getAllByText("Something went wrong").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
    // In development the error stays visible.
    expect(screen.getByText(/kaboom/)).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing when it crashes while closed", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<Safe open={false} />);
    expect(container.textContent).toBe("");
  });
});
