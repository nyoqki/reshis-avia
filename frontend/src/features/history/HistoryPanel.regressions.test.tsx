import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryItem } from "../../api/types";
import { HistoryPanel } from "./HistoryPanel";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, api: { ...actual.api, history: vi.fn() } };
});

import { api } from "../../api/client";

const OLDER: HistoryItem = {
  id: 1,
  route: "MOW-AER",
  origin: "Москва",
  destination: "Сочи",
  date: "2026-06-01",
  price: 9000,
  seats: 900,
  wants: 970,
  buys: 412,
  created_at: "2026-05-01T09:00:00Z",
};

beforeEach(() => {
  vi.mocked(api.history).mockReset();
});

describe("HistoryPanel regressions", () => {
  it("AC16: refetching keeps the current list on screen instead of a skeleton", async () => {
    vi.mocked(api.history).mockResolvedValueOnce({ items: [OLDER] });
    vi.mocked(api.history).mockReturnValueOnce(new Promise(() => {}));
    const { container, rerender } = render(
      <HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />,
    );
    expect((await screen.findAllByText(/Сочи/))[0]).toBeVisible();

    rerender(<HistoryPanel refreshKey={1} onSelect={() => {}} onSessionExpired={() => {}} />);

    await waitFor(() => expect(api.history).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/Сочи/)[0]).toBeVisible();
    expect(container.querySelector(".skeleton")).toBeNull();
  });
});
