import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { DEMO_LINKS } from "./data/placeholder";

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("app routes", () => {
  it("shows owner tools and links on the owner page", async () => {
    renderAt(`/edit/c/${DEMO_LINKS.counter.ownerToken}`);
    expect(await screen.findByRole("heading", { name: "Chapters drafted" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Add measurement" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy share link" })).toBeDefined();
    expect(screen.getByRole("figure", { name: "Forecast chart" })).toBeDefined();
  });

  it("never offers editing through a share link, even on the owner route", async () => {
    renderAt(`/edit/c/${DEMO_LINKS.counter.shareToken}`);
    expect(await screen.findByRole("heading", { name: "Chapters drafted" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add measurement" })).toBeNull();
    expect(screen.getByText(/view-only share link/)).toBeDefined();
  });

  it("shows a not-found state for unknown links and routes", async () => {
    renderAt("/p/missing");
    expect(await screen.findByRole("heading", { name: "This project is not here" })).toBeDefined();
    cleanup();
    renderAt("/no/such/page");
    expect(screen.getByRole("heading", { name: "Not done, not found" })).toBeDefined();
  });
});
