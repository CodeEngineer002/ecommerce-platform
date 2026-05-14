import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PriceDisplay } from "@/components/ecommerce/price-display";

describe("PriceDisplay", () => {
  it("renders price", () => {
    render(<PriceDisplay price={999} />);
    expect(screen.getByText(/999/)).toBeTruthy();
  });

  it("shows compare price when provided", () => {
    render(<PriceDisplay price={799} comparePrice={999} />);
    expect(screen.getByText(/999/)).toBeTruthy();
  });

  it("shows discount badge when compare price is higher", () => {
    render(<PriceDisplay price={800} comparePrice={1000} />);
    expect(screen.getByText(/20%/)).toBeTruthy();
  });

  it("does not show discount when prices are equal", () => {
    const { container } = render(<PriceDisplay price={1000} comparePrice={1000} />);
    expect(container.querySelector(".line-through")).toBeNull();
  });
});
