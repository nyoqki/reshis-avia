import { expect, type Page, test } from "@playwright/test";

const DEMO_NAME = "demo";

function isMobile(page: Page): boolean {
  const size = page.viewportSize();
  return size !== null && size.width <= 400;
}

// Desktop checks the reference case from the task, mobile a second price on the same route.
function scenario(page: Page) {
  return isMobile(page)
    ? { price: "12000", seats: "900", wants: "547", buys: "547", free: "353" }
    : { price: "9000", seats: "900", wants: "970", buys: "900", free: "0" };
}

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function demoLogin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Войти в демо-аккаунт" }).click();
  await expect(page.getByRole("button", { name: "Рассчитать" })).toBeVisible();
}

async function calculate(page: Page) {
  const { price } = scenario(page);
  await page.getByLabel("Куда").selectOption({ label: "Сочи" });
  await page.getByLabel("Дата вылета").fill("2026-06-12");
  await page.getByLabel("Цена билета, ₽").fill(price);
  await page.getByRole("button", { name: "Рассчитать" }).click();
  await expect(page.getByRole("region", { name: "Результат прогноза" })).toBeVisible();
}

function card(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Результат прогноза" })
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::span[1]");
}

test("AC21/AC2: demo login opens the calculator with the demo badge and the shared-demo note", async ({
  page,
}) => {
  await demoLogin(page);
  const header = page.getByRole("banner");
  await expect(header.getByText(DEMO_NAME, { exact: true })).toBeVisible();
  await expect(header.getByText("демо", { exact: true })).toBeVisible();
  await expect(header.getByText(/Общий демо-аккаунт/)).toBeVisible();
});

test("AC21/AC9: the calculation shows the expected cards", async ({ page }) => {
  await demoLogin(page);
  await calculate(page);
  const s = scenario(page);
  await expect(card(page, "Мест в самолёте")).toHaveText(s.seats);
  await expect(card(page, "Желают купить")).toHaveText(s.wants);
  await expect(card(page, "Купят")).toHaveText(s.buys);
  await expect(card(page, "Свободно")).toHaveText(s.free);
});

test("AC21/AC12: the chart canvas and the scenario table are visible", async ({ page }) => {
  await demoLogin(page);
  await calculate(page);
  const chart = page.getByRole("region", { name: "Распределение спроса" });
  await expect(chart.getByRole("img")).toBeVisible();
  await expect(chart.getByRole("columnheader", { name: "Сценарий" })).toBeVisible();
  await expect(chart.getByRole("row")).toHaveCount(10); // header + 9 scenarios
});

test("AC21/AC16: the history shows this calculation's price at the top", async ({ page }) => {
  await demoLogin(page);
  await calculate(page);
  const history = page.getByRole("region", { name: "История расчётов" });
  const top = isMobile(page)
    ? history.getByRole("listitem").first()
    : history.getByRole("row").nth(1);
  const digits = scenario(page).price.replace(/(\d)(\d{3})$/, "$1\\s?$2");
  await expect(top).toContainText(new RegExp(`Сочи[\\s\\S]*${digits}`));
});

test("AC21/AC3/AC6/AC4: register, empty history, logout, login again", async ({ page }) => {
  const username = `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const password = "e2e-user-password-1";

  await page.goto("/");
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.getByLabel("Имя пользователя").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page.getByRole("button", { name: "Рассчитать" })).toBeVisible();
  await expect(page.getByRole("banner").getByText(username, { exact: true })).toBeVisible();
  await expect(page.getByText("Пока нет расчётов")).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("button", { name: "Войти в демо-аккаунт" })).toBeVisible();

  await page.getByRole("tab", { name: "Вход" }).click();
  await page.getByLabel("Имя пользователя").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("button", { name: "Рассчитать" })).toBeVisible();
  await expect(page.getByRole("banner").getByText(username, { exact: true })).toBeVisible();
});

test("AC19: no horizontal scroll on the login screen, the result view and the history", {
  tag: "@mobile",
}, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Войти в демо-аккаунт" })).toBeVisible();
  await assertNoHorizontalScroll(page);

  await demoLogin(page);
  await calculate(page);
  await assertNoHorizontalScroll(page);

  await expect(page.getByRole("region", { name: "История расчётов" })).toBeVisible();
  await page.getByRole("region", { name: "История расчётов" }).scrollIntoViewIfNeeded();
  await assertNoHorizontalScroll(page);
});

function digitsOf(text: string | null): string {
  return (text ?? "").replace(/\D/g, "");
}

test("TB-AC6: brand files, manifest, icons, the font file and the absolute og:image are served", async ({
  page,
}) => {
  const manifestRes = await page.request.get("/manifest.json");
  expect(manifestRes.status()).toBe(200);
  expect(manifestRes.headers()["content-type"]).toContain("application/json");
  const manifest = (await manifestRes.json()) as {
    name: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe("Решись Авиа · прогноз спроса");
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const res = await page.request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"], icon.src).toContain("image/png");
  }

  const favicon = await page.request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");

  const og = await page.request.get("/og.png");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");

  const html = await (await page.request.get("/")).text();
  expect(html).toMatch(/<meta[^>]+property="og:image"[^>]+content="https?:\/\/[^"]+"/);

  await page.goto("/");
  const url = await page.evaluate(async () => {
    for (const link of Array.from(
      document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"),
    )) {
      const css = await (await fetch(link.href)).text();
      const m = css.match(/url\(["']?([^"')]*\.woff2)["']?\)/);
      if (m?.[1]) return new URL(m[1], link.href).href;
    }
    return null;
  });
  expect(url).not.toBeNull();
  expect(new URL(url as string).pathname).toMatch(/^\/assets\/.*\.woff2$/);
  const fontRes = await page.request.get(url as string);
  expect(fontRes.status()).toBe(200);
  expect(fontRes.headers()["content-type"]).toContain("font/woff2");
});

test("TB-AC14: «Подставить» puts the recommended price into the form, the board header and the history", async ({
  page,
}) => {
  await demoLogin(page);
  await calculate(page);
  const result = page.getByRole("region", { name: "Результат прогноза" });
  const recommended = digitsOf(
    await result
      .getByText("Рекомендуемая цена", { exact: true })
      .locator("xpath=following::span[1]")
      .textContent(),
  );
  expect(recommended).not.toBe("");

  const priceInput = page.getByLabel("Цена билета, ₽");
  await result.getByRole("button", { name: "Подставить" }).click();
  await expect(priceInput).toHaveValue(recommended);

  await expect(async () => {
    const header = digitsOf(
      await page
        .getByRole("region", { name: "Результат прогноза" })
        .locator("p", { hasText: /₽/ })
        .first()
        .textContent(),
    );
    expect(header).toBe(recommended);
  }).toPass();

  const history = page.getByRole("region", { name: "История расчётов" });
  const top = isMobile(page)
    ? history.getByRole("listitem").first()
    : history.getByRole("row").nth(1);
  await expect(async () => {
    expect(digitsOf(await top.textContent())).toContain(recommended);
  }).toPass();
});

test("TB-AC9/TB-AC16: with reduced motion the login screen shows the plane still and no canvas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Войти в демо-аккаунт" })).toBeVisible();
  const still = page.locator("main img[src*='plane'], img[src*='plane']").first();
  await expect(still).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});

// The phone header shows icons only; the labelled segments are desktop, so this test is tagged @desktop.
test("TB-AC17: the «Тёмная» segment switches the theme", { tag: "@desktop" }, async ({ page }) => {
  await demoLogin(page);
  const banner = page.getByRole("banner");
  await banner.getByText("Тёмная", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();
});

test("TB-AC4: Golos Text is loaded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Войти в демо-аккаунт" })).toBeVisible();
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const families = Array.from(document.fonts)
      .filter((f) => f.status === "loaded")
      .map((f) => f.family.replace(/["']/g, ""));
    return { check: document.fonts.check('16px "Golos Text"'), families };
  });
  expect(result.check).toBe(true);
  expect(result.families).toContain("Golos Text");
});
