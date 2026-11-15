import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./Field";
import { Input } from "./inputs";
import { SegmentedControl } from "./SegmentedControl";
import { Tabs } from "./Tabs";

describe("Input", () => {
  it("TB-AC5: a read-only input sits on the sunken paper with the secondary ink in both themes, so it never reads as editable", () => {
    render(<Input aria-label="Город вылета" readOnly value="Москва" />);
    const input = screen.getByLabelText("Город вылета");
    // tokens, not dark: variants: the theme swaps the token values under one class
    expect(input).toHaveClass("read-only:bg-paper-sunken", "read-only:text-ink-2");
  });
});

describe("Field", () => {
  it("TB-AC5: links the hint to the control through aria-describedby and the label through htmlFor", () => {
    render(
      <Field id="price" label="Цена" hint="В рублях за штуку">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Цена");
    expect(input).toHaveAttribute("id", "price");
    expect(input).toHaveAttribute("aria-describedby", "price-hint");
    expect(input).toHaveAccessibleDescription("В рублях за штуку");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Цена")).toHaveAttribute("for", "price");
  });

  it("TB-AC19: a warning has class text-warning, joins aria-describedby after the hint and does not set aria-invalid", () => {
    render(
      <Field id="price" label="Цена" hint="Подсказка" warning="Цена выше обычной">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Цена");
    const warning = screen.getByText("Цена выше обычной");
    expect(warning).toHaveAttribute("id", "price-warning");
    expect(warning).toHaveClass("text-warning");
    expect(input).toHaveAttribute("aria-describedby", "price-hint price-warning");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("TB-AC19: an error sets aria-invalid, joins aria-describedby, and its paragraph's parent contains the control", () => {
    render(
      <Field id="price" label="Цена" hint="Подсказка" warning="Осторожно" error="Введите число">
        {(control) => <Input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Цена");
    const error = screen.getByText("Введите число");
    expect(error).toHaveAttribute("id", "price-error");
    expect(error).toHaveClass("text-danger");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "price-hint price-warning price-error");
    expect(error.parentElement).toContainElement(input);
  });
});

const OPTIONS = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
] as const;

describe("SegmentedControl", () => {
  it("TB-AC17: renders radios named by their labels inside a group named by the legend; the checked radio follows value", () => {
    render(
      <SegmentedControl
        name="theme"
        legend="Тема"
        value="dark"
        options={[...OPTIONS]}
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole("group", { name: "Тема" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Тёмная" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Светлая" })).not.toBeChecked();
  });

  it("TB-AC17: clicking another radio calls onChange with its value; a compact control keeps the accessible names", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        name="theme"
        legend="Тема"
        value="light"
        compact
        options={OPTIONS.map((o) => ({ ...o, icon: <svg aria-hidden="true" /> }))}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radio", { name: "Светлая" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Тёмная" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("TB-AC3/TB-AC17: each segment label wraps its radio and carries the focus-visible ring hook", () => {
    render(
      <SegmentedControl
        name="theme"
        legend="Тема"
        value="light"
        options={[...OPTIONS]}
        onChange={() => {}}
      />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      const label = radio.closest("label");
      expect(label).not.toBeNull();
      expect(label?.className).toMatch(/(has-focus-visible|peer-focus-visible):outline-2/);
    }
  });

  it("TB-AC5: unchecked segments have a pressed style; the end segments round with the frame", () => {
    render(
      <SegmentedControl
        name="theme"
        legend="Тема"
        value="light"
        options={[...OPTIONS]}
        onChange={() => {}}
      />,
    );
    const labels = screen.getAllByRole("radio").map((radio) => radio.closest("label"));
    for (const label of labels) {
      expect(label).toHaveClass("first:rounded-l-control", "last:rounded-r-control");
      if (!label?.querySelector("input")?.checked) expect(label).toHaveClass("active:bg-line");
    }
  });
});

function TabsHarness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return (
    <Tabs
      idPrefix="t"
      label="Разделы"
      value={value}
      onChange={setValue}
      tabs={[
        { id: "a", label: "Первая" },
        { id: "b", label: "Вторая" },
        { id: "c", label: "Третья" },
      ]}
    >
      <p>Содержимое {value}</p>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("TB-AC5: marks the active tab aria-selected and labels the panel with it", () => {
    render(<TabsHarness />);
    const first = screen.getByRole("tab", { name: "Первая" });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("id", "t-tab-a");
    expect(first).toHaveAttribute("aria-controls", "t-panel");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Вторая" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Вторая" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "Первая" })).toHaveAttribute("id", "t-panel");
  });

  it("TB-AC5: an unselected tab has a pressed style", () => {
    render(<TabsHarness />);
    expect(screen.getByRole("tab", { name: "Вторая" })).toHaveClass("active:bg-line");
  });

  it("TB-AC5: ArrowRight from the first tab focuses and activates the second; End and Home jump to the ends", async () => {
    render(<TabsHarness />);
    screen.getByRole("tab", { name: "Первая" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    const second = screen.getByRole("tab", { name: "Вторая" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Вторая" })).toBeInTheDocument();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Третья" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Третья" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Первая" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Первая" })).toHaveAttribute("aria-selected", "true");
  });
});
