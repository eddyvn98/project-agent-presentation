import { test, expect } from "@playwright/test";

function random(seed) {
  let state = seed >>> 0;
  return max => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % max;
  };
}
const actions = ["Move up", "Move down", "Move left", "Move right",
  "width plus 100 mm", "width minus 100 mm", "depth plus 100 mm", "depth minus 100 mm"];
const seeds = [0xcad, 0xb17, 0x2026];

for (const seed of seeds) {
  test("real browser UI fuzz seed=" + seed + " applies and reexports an unchanged original", async ({ page }) => {
    const randomAction = random(seed);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const original = "design-abcdefabcdef";
    await page.goto("/design-real-qa.html");
    const originalSource = await page.request.get("/api/qa/design-real/files/" + original + ".design.json").then(r => r.json());
    const oldGlb = await page.request.get("/api/qa/design-real/files/" + original + ".glb").then(r => r.body());
    await page.getByRole("region", { name: "Design handoff " + original })
      .getByRole("button", { name: "Edit on floor plan" }).click();
    const editor = page.getByRole("region", { name: "Editable 2D interior floor plan" });
    await expect(editor).toBeVisible();
    const trace = [];
    for (let i = 0; i < 20; i++) {
      const action = actions[randomAction(actions.length)];
      trace.push(action);
      try {
        await editor.getByRole("button", { name: action, exact: true }).click();
        await expect(editor.getByRole("alert")).toHaveCount(0);
        await expect(editor.getByRole("button", { name: "Move right", exact: true })).toBeVisible();
      } catch (error) {
        throw Error("UI FUZZ seed=" + seed + " step=" + i +
          " actions=" + trace.join(" | ") + " error=" + String(error));
      }
    }
    if (await editor.getByRole("button", { name: "Prepare new revision in chat" }).isDisabled()) {
      await editor.getByRole("button", { name: "Move right", exact: true }).click();
    }
    await editor.getByRole("button", { name: "Prepare new revision in chat" }).click();
    const textarea = page.getByRole("textbox", { name: "Design change draft" });
    await expect(textarea).toContainText('"action":"design_edit"');
    await page.getByRole("button", { name: "Submit revision and export" }).click();
    await expect(page.getByTestId("real-revision-result")).toContainText("the original files remain available");
    const result = await page.getByTestId("real-revision-result").textContent();
    const newer = result.match(/design-[a-f0-9]{12}/)[0];
    expect(newer).not.toBe(original);
    const actual = await page.request.get("/api/qa/design-real/files/" + newer + ".design.json").then(r => r.json());
    expect(actual.furniture[0]).not.toEqual(originalSource.furniture[0]);
    const newGlb = await page.request.get("/api/qa/design-real/files/" + newer + ".glb").then(r => r.body());
    expect(newGlb.equals(oldGlb)).toBe(false);
    expect(await page.request.get("/api/qa/design-real/files/" + original + ".design.json").then(r => r.json())).toEqual(originalSource);
    expect((await page.request.get("/api/qa/design-real/files/" + original + ".glb").then(r => r.body())).equals(oldGlb)).toBe(true);
    expect(errors).toEqual([]);
  });
}
