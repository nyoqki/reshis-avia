import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { HistoryItem } from "../../api/types";
import { HistoryPanel } from "./HistoryPanel";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, api: { ...actual.api, history: vi.fn() } };
});

import { api } from "../../api/client";

const NEWER: HistoryItem = {
  id: 2,
  route: "MOW-KZN",
  origin: "Москва",
  destination: "Казань",
  date: "2026-06-12",
  price: 12000,
  seats: 900,
  wants: -3120,
  buys: 0,
  created_at: "2026-05-02T10:30:00Z",
};

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

function text(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/\s/g, " ");
}

beforeEach(() => {
  vi.mocked(api.history).mockReset();
});

describe("HistoryPanel", () => {
  it("AC16: renders items in the returned order with route, date, price, wants and buys; negative wants show 0", async () => {
    vi.mocked(api.history).mockResolvedValue({ items: [NEWER, OLDER] });
    const { container } = render(
      <HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />,
    );

    expect((await screen.findAllByText(/Казань/))[0]).toBeVisible();
    const t = text(container);
    expect(t.indexOf("Казань")).toBeGreaterThanOrEqual(0);
    expect(t.indexOf("Казань")).toBeLessThan(t.indexOf("Сочи"));
    expect(t).toContain("12 июня 2026");
    expect(t).toContain("1 июня 2026");
    expect(t).toContain("12 000 ₽");
    expect(t).toContain("9 000 ₽");
    expect(t).toContain("970");
    expect(t).toContain("412");
    expect(t).not.toMatch(/3\s?120/);
    expect(t).not.toContain("-3");
    expect(t).not.toContain("−3");
  });

  it("AC16: the column with the calculation time is labelled «Время»", async () => {
    vi.mocked(api.history).mockResolvedValue({ items: [NEWER, OLDER] });
    render(<HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />);
    expect(await screen.findByRole("columnheader", { name: "Время" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Расчёт" })).toBeNull();
  });

  it("AC16: empty items show the Russian empty-state text", async () => {
    vi.mocked(api.history).mockResolvedValue({ items: [] });
    render(<HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />);

    expect(await screen.findByText(/пока нет|ещё нет|пуст|не было|не делали/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Казань|Сочи/ })).toBeNull();
  });

  it("AC16: clicking an entry calls onSelect with that item", async () => {
    vi.mocked(api.history).mockResolvedValue({ items: [NEWER, OLDER] });
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<HistoryPanel refreshKey={0} onSelect={onSelect} onSessionExpired={() => {}} />);

    const entries = await screen.findAllByRole("button", { name: /Сочи/ });
    await user.click(entries[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(OLDER);
  });

  it("AC19: a failed fetch shows an error and «Повторить» refetches and renders the list", async () => {
    vi.mocked(api.history)
      .mockRejectedValueOnce(new ApiError(500, "Сервер временно недоступен."))
      .mockResolvedValueOnce({ items: [OLDER] });
    const user = userEvent.setup();
    render(<HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />);

    expect(await screen.findByText("Сервер временно недоступен.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect((await screen.findAllByText(/Сочи/))[0]).toBeVisible();
    expect(api.history).toHaveBeenCalledTimes(2);
  });

  it("AC19: a 401 calls onSessionExpired", async () => {
    vi.mocked(api.history).mockRejectedValue(new ApiError(401, "Нужно войти в аккаунт."));
    const onExpired = vi.fn();
    render(<HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={onExpired} />);
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("AC16: changing refreshKey refetches", async () => {
    vi.mocked(api.history).mockResolvedValueOnce({ items: [OLDER] });
    vi.mocked(api.history).mockResolvedValueOnce({ items: [NEWER, OLDER] });
    const { rerender } = render(
      <HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />,
    );
    expect((await screen.findAllByText(/Сочи/))[0]).toBeVisible();
    expect(screen.queryByText(/Казань/)).toBeNull();

    rerender(<HistoryPanel refreshKey={1} onSelect={() => {}} onSessionExpired={() => {}} />);

    expect((await screen.findAllByText(/Казань/))[0]).toBeVisible();
    expect(api.history).toHaveBeenCalledTimes(2);
  });
  it("TB-AC13: after a refresh with a new item, its row and list item are fresh and the older ones are not; the first load marks none", async () => {
    vi.mocked(api.history).mockResolvedValueOnce({ items: [OLDER] });
    vi.mocked(api.history).mockResolvedValueOnce({ items: [NEWER, OLDER] });
    const { container, rerender } = render(
      <HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />,
    );
    expect((await screen.findAllByText(/Сочи/))[0]).toBeVisible();
    expect(container.querySelector('[data-fresh="true"]')).toBeNull();

    rerender(<HistoryPanel refreshKey={1} onSelect={() => {}} onSessionExpired={() => {}} />);
    expect((await screen.findAllByText(/Казань/))[0]).toBeVisible();

    const fresh = Array.from(container.querySelectorAll('[data-fresh="true"]'));
    expect(fresh).toHaveLength(2);
    const row = fresh.find((el) => el.tagName === "TR");
    const item = fresh.find((el) => el.tagName === "LI");
    expect(row).toBeDefined();
    expect(item).toBeDefined();
    expect(row?.textContent).toContain("Казань");
    expect(item?.textContent).toContain("Казань");
    for (const el of fresh) expect(el.textContent).not.toContain("Сочи");
  });

  it("TB-AC13: the empty state shows blank flap cells hidden from assistive tech next to the empty text", async () => {
    vi.mocked(api.history).mockResolvedValue({ items: [] });
    const { container } = render(
      <HistoryPanel refreshKey={0} onSelect={() => {}} onSessionExpired={() => {}} />,
    );
    expect(await screen.findByText(/Пока нет расчётов/)).toBeVisible();
    const blanks = container.querySelectorAll('.flap-cell[data-tone="blank"]');
    expect(blanks.length).toBeGreaterThan(0);
    for (const b of blanks) expect(b.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
