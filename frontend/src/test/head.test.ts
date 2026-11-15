import { describe, expect, it } from "vitest";

import html from "../../index.html?raw";

const doc = new DOMParser().parseFromString(html, "text/html");

const meta = (attr: "name" | "property", value: string): Element[] =>
  Array.from(doc.querySelectorAll(`meta[${attr}="${value}"]`));

const content = (attr: "name" | "property", value: string): string | null =>
  meta(attr, value)[0]?.getAttribute("content") ?? null;

describe("index.html brand head", () => {
  it("keeps the title and the ru language", () => {
    expect(doc.title).toBe("Решись Авиа · прогноз спроса");
    expect(doc.documentElement.getAttribute("lang")).toBe("ru");
  });

  it("links the icon, apple-touch-icon and manifest", () => {
    const icon = doc.querySelector('link[rel="icon"]');
    expect(icon?.getAttribute("href")).toBe("/favicon.svg");
    expect(icon?.getAttribute("type")).toBe("image/svg+xml");
    expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")).toBe(
      "/apple-touch-icon.png",
    );
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/manifest.json");
  });

  it("has one theme-color per prefers-color-scheme value", () => {
    const byMedia = new Map(
      meta("name", "theme-color").map((m) => [m.getAttribute("media"), m.getAttribute("content")]),
    );
    expect(byMedia.size).toBe(2);
    expect(byMedia.get("(prefers-color-scheme: light)")).toBe("#f7f6f2");
    expect(byMedia.get("(prefers-color-scheme: dark)")).toBe("#15171c");
  });

  it("has a meta description", () => {
    expect((content("name", "description") ?? "").trim().length).toBeGreaterThan(0);
  });

  it("has Open Graph and Twitter metas", () => {
    expect(content("property", "og:type")).toBe("website");
    expect(content("property", "og:locale")).toBe("ru_RU");
    expect(content("property", "og:site_name")).toBe("Решись Авиа");
    expect((content("property", "og:title") ?? "").length).toBeGreaterThan(0);
    expect((content("property", "og:description") ?? "").length).toBeGreaterThan(0);
    expect(content("property", "og:url")).toBe("https://reshis.jiraya.ru/");
    expect((content("property", "og:image:alt") ?? "").length).toBeGreaterThan(0);
    expect(content("name", "twitter:card")).toBe("summary_large_image");
  });

  it("points og:image at an absolute https og.png of 1200x630", () => {
    const image = content("property", "og:image");
    expect(image).toBe("https://reshis.jiraya.ru/og.png");
    expect(content("property", "og:image:width")).toBe("1200");
    expect(content("property", "og:image:height")).toBe("630");
  });
});
