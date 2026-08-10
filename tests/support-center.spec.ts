import { expect, test } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

test("gives guests public help plus valid sign-in and email paths", async ({ page }) => {
  await page.goto("/support");
  const trigger = page.getByRole("button", { name: "Open Support Center" });
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Support center" });
  await expect(dialog).toBeVisible();
  const helpTab = dialog.getByRole("tab", { name: "Help" });
  await expect(helpTab).toHaveAttribute("aria-selected", "true");
  await helpTab.focus();
  await page.keyboard.press("End");
  await expect(dialog.getByRole("tab", { name: "My requests" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(helpTab).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("heading", { name: "Common guides" })).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Search help guides" }).fill("privacy");
  await expect(dialog.getByText("Privacy controls")).toBeVisible();

  await dialog.getByRole("tab", { name: "New request" }).click();
  await expect(dialog.getByRole("heading", { name: "Sign in to send a request" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Email support@filosage.com/ })).toHaveAttribute("href", /mailto:support@filosage\.com/);

  await dialog.getByRole("tab", { name: "My requests" }).click();
  await expect(dialog.getByRole("heading", { name: "Sign in to view your requests" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const gateway = page.getByRole("button", { name: "Send a support request" });
  await gateway.click();
  await expect(dialog.getByRole("tab", { name: "New request" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(gateway).toBeFocused();
});

test("preserves request text after failure and safely resets after an asynchronous retry", async ({ page }) => {
  await restoreLocalLearner(page);
  let postCount = 0;
  const idempotencyKeys: string[] = [];
  await page.route("**/api/support/tickets", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    postCount += 1;
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (postCount === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary support service failure." }) });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ submitted: true, ticketNumber: "TKT-RESET01", ticketId: "ticket-reset-regression" }) });
  });
  await page.goto("/support");
  await page.getByRole("button", { name: "Open Support Center" }).click();
  const dialog = page.getByRole("dialog", { name: "Support center" });
  await dialog.getByRole("tab", { name: "New request" }).click();

  const subject = dialog.getByLabel("Subject");
  const message = dialog.getByLabel("What happened?");
  await subject.fill("Lesson navigation fails after practice");
  await message.fill("The next lesson button stopped responding after I completed the practice activity.");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Temporary support service failure.");
  await expect(subject).toHaveValue("Lesson navigation fails after practice");
  await expect(message).toHaveValue("The next lesson button stopped responding after I completed the practice activity.");
  await dialog.getByLabel("Include this page").uncheck();

  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(subject).toBeDisabled();
  await expect(message).toBeDisabled();
  await expect(dialog.getByText("Request sent")).toBeVisible();
  await expect(dialog.getByText("TKT-RESET01")).toBeVisible();
  await expect(subject).toHaveValue("");
  await expect(message).toHaveValue("");
  expect(postCount).toBe(2);
  expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
});

test("blocks concurrent double submission before a second request reaches the server", async ({ page }) => {
  await restoreLocalLearner(page);
  let postCount = 0;
  await page.route("**/api/support/tickets", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    postCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ submitted: true, ticketNumber: "TKT-ONCE001", ticketId: "ticket-submit-once" }) });
  });
  await page.goto("/support");
  await page.getByRole("button", { name: "Open Support Center" }).click();
  const dialog = page.getByRole("dialog", { name: "Support center" });
  await dialog.getByRole("tab", { name: "New request" }).click();
  await dialog.getByLabel("Subject").fill("Prevent duplicate support request");
  await dialog.getByLabel("What happened?").fill("A slow connection must not create the same support request more than once.");
  await dialog.getByRole("button", { name: "Send request" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
    button.form?.requestSubmit();
  });
  await expect(dialog.getByText("TKT-ONCE001")).toBeVisible();
  expect(postCount).toBe(1);
});

test("keeps the request list open when a pending detail load is cancelled", async ({ page }) => {
  await restoreLocalLearner(page);
  const ticket = {
    id: "ticket-pending-detail",
    ticketNumber: "TKT-PENDING",
    category: "support",
    status: "submitted",
    subject: "Pending detail request",
    createdAt: "2026-08-10T04:30:00.000Z",
    updatedAt: "2026-08-10T04:30:00.000Z",
  };
  await page.route("**/api/support/tickets**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (new URL(route.request().url()).pathname.endsWith(ticket.id)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return route.fulfill({ json: { ticket: { ...ticket, description: "A delayed request detail response.", publicReplies: [] } } });
    }
    return route.fulfill({ json: { tickets: [ticket] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open Support Center" }).click();
  const dialog = page.getByRole("dialog", { name: "Support center" });
  await dialog.getByRole("tab", { name: "My requests" }).click();
  await dialog.getByText(ticket.subject).click();
  await dialog.getByRole("button", { name: "Back to requests" }).click();
  await expect(dialog.getByRole("heading", { name: "My requests" })).toBeVisible();
  await page.waitForTimeout(350);
  await expect(dialog.getByText(ticket.subject)).toBeVisible();
  await expect(dialog.getByRole("heading", { name: ticket.subject })).toHaveCount(0);
});

test("keeps the Spark and bottom sheet above mobile navigation with no overflow", async ({ page }) => {
  await restoreLocalLearner(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open Support Center" });
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(trigger).toBeVisible();
  await expect(mobileNavigation).toBeVisible();
  const placement = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('button[aria-label="Open Support Center"]')!;
    const spark = trigger.getBoundingClientRect();
    const icon = trigger.querySelector<SVGGraphicsElement>("svg")!;
    const artwork = icon.querySelector<SVGGraphicsElement>("path")!.getBBox();
    const navigation = document.querySelector<HTMLElement>('.mobile-bottom-nav')!.getBoundingClientRect();
    const style = getComputedStyle(trigger);
    return {
      sparkBottom: Math.round(spark.bottom),
      navigationTop: Math.round(navigation.top),
      rightGap: Math.round(innerWidth - spark.right),
      artworkCenterX: artwork.x + artwork.width / 2,
      artworkCenterY: artwork.y + artwork.height / 2,
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
      iconStroke: getComputedStyle(icon).stroke,
    };
  });
  expect(placement.sparkBottom).toBeLessThan(placement.navigationTop);
  expect(placement.rightGap).toBe(24);
  expect(placement.artworkCenterX).toBeCloseTo(24, 4);
  expect(placement.artworkCenterY).toBeCloseTo(24, 4);
  expect(placement.background).toBe("rgba(0, 0, 0, 0)");
  expect(placement.borderWidth).toBe("0px");
  expect(placement.iconStroke).not.toBe("rgba(0, 0, 0, 0)");

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Support center" });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".mobile-bottom-nav")!.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      navigationTop: Math.round(navigation.top),
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      bodyScrollable: element.querySelector<HTMLElement>("[class*='body']")?.scrollHeight !== undefined,
    };
  });
  expect(geometry).toMatchObject({ left: 0, right: 375, noHorizontalOverflow: true, bodyScrollable: true });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.navigationTop);
});

test("uses the themed Spark and honors reduced-motion mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-theme", "dark"));
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/support");
  const trigger = page.getByRole("button", { name: "Open Support Center" });
  await expect(trigger).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).every((meta) => meta.content.toUpperCase() === "#071127"))).toBe(true);
  await trigger.hover();
  await expect(page.getByRole("tooltip", { name: "Support center" })).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Support center" })).toBeVisible();
  await expect.poll(() => trigger.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await expect.poll(() => trigger.locator("svg").evaluate((element) => getComputedStyle(element).stroke)).not.toBe("rgba(0, 0, 0, 0)");
});

test("fits the required desktop, tablet, and mobile viewport matrix", async ({ page }) => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open Support Center" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Support center" });
    await expect(dialog).toBeVisible();
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const navigation = document.querySelector<HTMLElement>(".mobile-bottom-nav");
      const navigationTop = navigation && getComputedStyle(navigation).display !== "none"
        ? navigation.getBoundingClientRect().top
        : null;
      return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        navigationTop,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    if (geometry.navigationTop !== null) expect(geometry.bottom).toBeLessThanOrEqual(geometry.navigationTop);
    else expect(Math.round(geometry.bottom)).toBe(viewport.height);
    await dialog.getByRole("button", { name: "Close Support Center" }).click();
  }
});
