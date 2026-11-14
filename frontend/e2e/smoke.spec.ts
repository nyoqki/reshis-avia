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
  const top = isMobile(page) ? history.getByRole("listitem").first() : history.getByRole("row").nth(1);
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

test("AC19: no horizontal scroll on the login screen, the result view and the history", async ({
  page,
}) => {
  test.skip(!isMobile(page), "360 px project only");
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
