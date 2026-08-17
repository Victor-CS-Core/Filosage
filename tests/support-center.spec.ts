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
  await page.goto("/support");
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


test("unfolds the support sheet from the Spark with a reversible paper-crumple transition", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/support");
  await page.getByRole("button", { name: "Open Support Center" }).click();
  const dialog = page.locator("#global-support-center-drawer");
  await expect(dialog).toHaveAttribute("data-state", "open");
  const motion = await dialog.evaluate((element) => {
    const surface = element.querySelector<HTMLElement>(".app-drawer-surface")!;
    const style = getComputedStyle(surface);
    const fragment = getComputedStyle(element, "::before");
    const [originX, originY] = style.transformOrigin.split(" ").map(Number.parseFloat);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      originX,
      originY,
      width: surface.offsetWidth,
      height: surface.offsetHeight,
      clipPath: style.clipPath,
      fragmentContent: fragment.content,
      fragmentOpacity: fragment.opacity,
      modal: element.matches(":modal"),
    };
  });
  expect(motion.transitionProperty).toContain("clip-path");
  const longestFloatingTransition = Math.max(...motion.transitionDuration.split(",").map((value) => Number.parseFloat(value) * (value.includes("ms") ? 1 : 1000)));
  expect(longestFloatingTransition).toBeLessThanOrEqual(250);
  expect(motion.originX).toBeCloseTo(motion.width, 1);
  expect(motion.originY).toBeCloseTo(motion.height, 1);
  expect(motion.modal).toBe(false);
  expect(motion.clipPath).toContain("polygon");
  expect(motion.fragmentContent).not.toBe("none");
  expect(Number(motion.fragmentOpacity)).toBeLessThan(1);
  if (process.env.CAPTURE_DASHBOARD === "1") {
    await page.waitForTimeout(72);
    await page.screenshot({ path: ".impeccable/review/support-paper-unfold-motion-desktop.png", fullPage: false });
  }
  await expect.poll(() => dialog.evaluate((element) => Number(getComputedStyle(element, "::before").opacity))).toBeLessThan(0.05);
  if (process.env.CAPTURE_DASHBOARD === "1") {
    await page.screenshot({ path: ".impeccable/review/support-paper-unfold-desktop.png", fullPage: false });
  }

  await page.getByRole("button", { name: "Close Support Center" }).evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForTimeout(32);
  await expect(dialog).toHaveAttribute("data-state", "closing");
  await expect(dialog).toBeHidden();
});

test("uses the themed Spark and honors reduced-motion mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-theme", "dark"));
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/support");
  const trigger = page.getByRole("button", { name: "Open Support Center" });
  await expect(trigger).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
  await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).every((meta) => meta.content.toUpperCase() === "#071127"))).toBe(true);
  const tooltip = page.getByRole("tooltip", { name: "Support center" });
  if ((page.viewportSize()?.width ?? 0) > 900) {
    await trigger.hover();
    await expect(tooltip).toBeVisible();
  } else {
    await expect(tooltip).toBeHidden();
  }
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Support center" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => trigger.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await expect.poll(() => trigger.locator("svg").evaluate((element) => getComputedStyle(element).stroke)).not.toBe("rgba(0, 0, 0, 0)");
  const reducedMotion = await dialog.evaluate((element) => {
    const surface = element.querySelector<HTMLElement>(".app-drawer-surface")!;
    return {
      transitionDuration: getComputedStyle(surface).transitionDuration,
      fragmentDisplay: getComputedStyle(element, "::before").display,
      clipPath: getComputedStyle(surface).clipPath,
    };
  });
  const longestTransition = Math.max(...reducedMotion.transitionDuration.split(",").map((value) => Number.parseFloat(value) * (value.includes("ms") ? 1 : 1000)));
  expect(longestTransition).toBeLessThanOrEqual(1);
  expect(reducedMotion.fragmentDisplay).toBe("none");
  expect(reducedMotion.clipPath).toBe("none");
});

test("switches an open support surface between desktop floating and tablet modal presentation", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/support");
  await page.getByRole("button", { name: "Open Support Center" }).click();
  const dialog = page.getByRole("dialog", { name: "Support center" });
  await expect.poll(() => dialog.evaluate((element) => element.matches(":modal"))).toBe(false);
  await expect(dialog).toHaveAttribute("data-presentation", "floating");
  const moveHandle = dialog.getByRole("button", { name: "Move Support center window" });
  await expect(moveHandle).toBeVisible();
  const initialBox = await dialog.boundingBox();
  await moveHandle.focus();
  await moveHandle.press("Shift+ArrowLeft");
  await moveHandle.press("Shift+ArrowUp");
  const movedBox = await dialog.boundingBox();
  expect(movedBox?.x).toBeCloseTo((initialBox?.x ?? 0) - 48, 0);
  expect(movedBox?.y).toBeCloseTo((initialBox?.y ?? 0) - 48, 0);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect.poll(() => dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(dialog).toHaveAttribute("data-presentation", "modal");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  await page.setViewportSize({ width: 1366, height: 900 });
  await expect.poll(() => dialog.evaluate((element) => element.matches(":modal"))).toBe(false);
  await expect(dialog).toHaveAttribute("data-presentation", "floating");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  const restoredBox = await dialog.boundingBox();
  expect(restoredBox?.x).toBeCloseTo(initialBox?.x ?? 0, 0);
  expect(restoredBox?.y).toBeCloseTo(initialBox?.y ?? 0, 0);
});

test("fits the required desktop, tablet, and mobile viewport matrix", async ({ page }) => {
  test.setTimeout(90_000);
  // This test measures settled geometry; motion behavior is covered separately.
  await page.emulateMedia({ reducedMotion: "reduce" });
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
    const isShortMobile = viewport.width === 375 && viewport.height === 667;
    if (isShortMobile) await restoreLocalLearner(page);
    await page.goto("/support");
    const trigger = page.getByRole("button", { name: "Open Support Center" });
    await expect(trigger).toBeVisible();
    if (isShortMobile) {
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
      const placement = await page.evaluate(() => {
        const trigger = document.querySelector<HTMLElement>('button[aria-label="Open Support Center"]')!;
        const spark = trigger.getBoundingClientRect();
        const icon = trigger.querySelector<SVGGraphicsElement>("svg")!;
        const artwork = icon.querySelector<SVGGraphicsElement>("path")!.getBBox();
        const navigation = document.querySelector<HTMLElement>(".mobile-bottom-nav")!.getBoundingClientRect();
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
    }
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Support center" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-state", "open");
    if (viewport.width > 900) {
      await expect.poll(async () => dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          rightInset: Math.round(window.innerWidth - rect.right),
          bottomInset: Math.round(window.innerHeight - rect.bottom),
        };
      }), { message: `Support Center should settle at the floating inset for ${viewport.width}x${viewport.height}.` }).toEqual({
        rightInset: 24,
        bottomInset: 88,
      });
    }
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector<HTMLElement>("[class*='body']");
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
        modal: element.matches(":modal"),
        bodyOverflow: body ? getComputedStyle(body).overflowY : "",
        bodyScrollable: Boolean(body && body.scrollHeight > body.clientHeight),
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    if (viewport.width > 900) {
      expect(geometry.modal).toBe(false);
      expect(Math.round(viewport.width - geometry.right)).toBe(24);
      expect(Math.round(viewport.height - geometry.bottom)).toBe(88);
    } else {
      expect(geometry.modal).toBe(true);
      if (geometry.navigationTop !== null) expect(geometry.bottom).toBeLessThanOrEqual(geometry.navigationTop);
      else expect(Math.round(geometry.bottom)).toBe(viewport.height);
    }
    if (isShortMobile) {
      expect(geometry).toMatchObject({ left: 0, right: 375, bodyScrollable: true });
      expect(["auto", "scroll"]).toContain(geometry.bodyOverflow);
    }
    await dialog.getByRole("button", { name: "Close Support Center" }).click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(dialog).toBeHidden();
  }
});
