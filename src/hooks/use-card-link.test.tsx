import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useCardLink } from "./use-card-link";

function CardUnderTest({ desktop }: { desktop?: boolean }) {
  const link = useCardLink("/target", { desktop });
  return (
    <section data-testid="card" onClick={link.onClick}>
      <p data-testid="text">Some text</p>
      <button type="button" data-testid="inner">Inner</button>
    </section>
  );
}

const setWidth = (desktop: boolean) =>
  (window.matchMedia as unknown as ReturnType<typeof vi.fn>) = vi.fn().mockImplementation((q: string) => ({ matches: desktop && q.includes("min-width"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));

function setup(desktop?: boolean) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<CardUnderTest desktop={desktop} />} />
        <Route path="/target" element={<p>Target page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useCardLink", () => {
  beforeEach(() => setWidth(false));

  it("a tap on the card body navigates on a phone", () => {
    const r = setup();
    fireEvent.click(r.getByTestId("text"));
    expect(r.queryByText("Target page")).not.toBeNull();
  });

  it("inner buttons keep working (no navigation)", () => {
    const r = setup();
    fireEvent.click(r.getByTestId("inner"));
    expect(r.queryByText("Target page")).toBeNull();
  });

  it("multi-destination cards aren't clickable on desktop; single ones are", () => {
    setWidth(true);
    const multi = setup();
    fireEvent.click(multi.getByTestId("text"));
    expect(multi.queryByText("Target page")).toBeNull();
    multi.unmount();
    const single = setup(true);
    fireEvent.click(single.getByTestId("text"));
    expect(single.queryByText("Target page")).not.toBeNull();
  });
});
