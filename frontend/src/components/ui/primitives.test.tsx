import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { Skeleton } from "./Skeleton";

describe("Button", () => {
  it("AC5: defaults to type=button and forwards onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Прогноз</Button>);
    const btn = screen.getByRole("button", { name: "Прогноз" });
    expect(btn).toHaveAttribute("type", "button");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("AC5: a loading Button is disabled, aria-busy and shows loadingLabel; click does not call onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Считаем…" onClick={onClick}>
        Прогноз
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Считаем…" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Прогноз")).not.toBeInTheDocument();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("AC5: a disabled Button does not call onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Прогноз
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Прогноз" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Notice", () => {
  it("AC19: an error Notice has role alert and its «Повторить» button calls onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <Notice tone="error" onRetry={onRetry}>
        Не удалось загрузить
      </Notice>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Не удалось загрузить");
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("AC19: a Notice without onRetry has no button; an info Notice has no role; role can be overridden to status", () => {
    const { rerender } = render(<Notice tone="info">Подсказка</Notice>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(
      <Notice tone="info" role="status">
        Подсказка
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Подсказка");
  });
});

describe("Badge", () => {
  it("AC5: renders its text", () => {
    render(<Badge tone="demo">Демо</Badge>);
    expect(screen.getByText("Демо")).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("AC5: has class skeleton and aria-busy=true; the board variant renders the requested rows hidden from assistive tech", () => {
    const { container, rerender } = render(<Skeleton />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("skeleton");
    expect(root).toHaveAttribute("aria-busy", "true");

    rerender(<Skeleton variant="board" rows={3} />);
    const board = container.firstElementChild as HTMLElement;
    expect(board).toHaveClass("skeleton");
    expect(board).toHaveAttribute("aria-busy", "true");
    const hidden = board.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(3);
  });
});
