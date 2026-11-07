import { test, expect } from "@playwright/test";

test("mobile handoff previews, edits and downloads semantic CAD BIM files", async ({ page, isMobile }) => {
  await page.route("**/api/qa/design/**", (route) => {
    const id = route.request().url().split("/").at(-1);
    return route.fulfill({
      status: 200,
      contentType: id === "preview.png" ? "image/png" : "application/octet-stream",
      headers: { "Content-Disposition": 'attachment; filename="' + id + '"' },
      body: id === "preview.png" ? Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GfwAAAAASUVORK5CYII=", "base64"
      ) : "Synthetic QA file: " + id,
    });
  });
  await page.goto("/design-handoff-qa.html");
  const handoff = page.getByRole("region", { name: /Design handoff design-abcdefabcdef/i });
  await expect(handoff).toBeVisible();
  if (isMobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  }
  await handoff.getByRole("button", { name: "View PDF" }).click();
  await expect(page.getByRole("status")).toContainText("design-abcdefabcdef.pdf");
  await handoff.getByRole("button", { name: "View 3D" }).click();
  await expect(page.getByRole("status")).toContainText("design-abcdefabcdef.web.html");
  await handoff.getByRole("button", { name: "Request a change" }).click();
  await expect(page.getByRole("textbox", { name: "Design change draft" })).toContainText("design_edit");
  const needed = ["CAD · DXF", "Revit · IFC", "3D · GLB", "Drawing · PDF", "Source · JSON"];
  for (const label of needed) {
    const link = handoff.getByRole("link", { name: "Download " + label });
    await expect(link).toBeVisible();
    expect(await link.getAttribute("download")).toMatch(/^design-abcdefabcdef/);
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(40);
  }
  const download = page.waitForEvent("download");
  await handoff.getByRole("link", { name: "Download Revit · IFC" }).click();
  expect((await download).suggestedFilename()).toBe("design-abcdefabcdef.ifc");
});

test("revision CTA does not submit automatically", async ({ page }) => {
  const calls = [];
  page.on("request", request => {
    if (request.method() === "POST") calls.push(request.url());
  });
  await page.goto("/design-handoff-qa.html");
  await page.getByRole("button", { name: "Request a change" }).click();
  await expect(page.getByRole("textbox", { name: "Design change draft" })).toHaveValue(/outputs\/design-abcdefabcdef\.design\.json/);
  expect(calls).toHaveLength(0);
});
