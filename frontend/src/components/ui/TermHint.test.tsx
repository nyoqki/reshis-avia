import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TermHint } from "./TermHint";

function setup() {
  render(
    <div>
      <TermHint term="Купят">Столько мест реально купят.</TermHint>
      <p>Снаружи</p>
    </div>,
  );
  return screen.getByRole("button", { name: "Что значит «Купят»" });
}

describe("TermHint", () => {
  it("AC15: the trigger is a button with empty text content and aria-expanded=false", () => {
    const trigger = setup();
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveTextContent("");
    expect(trigger.textContent).toBe("");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("AC15: click opens the explanation and aria-controls points at it", async () => {
    const user = userEvent.setup();
    const trigger = setup();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByText("Столько мест реально купят.");
    expect(panel).toBeVisible();
    const controlled = trigger.getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    expect(panel.closest(`[id="${controlled}"]`)).not.toBeNull();
  });

  it("AC15: a second click closes the panel", async () => {
    const user = userEvent.setup();
    const trigger = setup();
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Столько мест реально купят.")).not.toBeInTheDocument();
  });

  it("AC15: Escape closes the panel and focus returns to the trigger", async () => {
    const user = userEvent.setup();
    const trigger = setup();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Столько мест реально купят.")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("AC15: a pointerdown outside closes the panel; the panel is absent from the DOM while closed", async () => {
    const user = userEvent.setup();
    const trigger = setup();
    expect(screen.queryByText("Столько мест реально купят.")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByText("Столько мест реально купят.")).toBeInTheDocument();
    await user.pointer({ keys: "[MouseLeft>]", target: screen.getByText("Снаружи") });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Столько мест реально купят.")).not.toBeInTheDocument();
  });

  it("AC15: keyboard Enter on the focused trigger opens it", async () => {
    const user = userEvent.setup();
    const trigger = setup();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Столько мест реально купят.")).toBeVisible();
  });
});
