import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the product name", () => {
    render(<App />);

    const heading = screen.getByRole("heading", {
      name: "Решись Авиа · прогноз спроса",
    });
    expect(heading).toBeTruthy();
  });
});
