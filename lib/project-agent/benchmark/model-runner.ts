import { callRuntimeModel } from "../runtime/model";
import { parseRuntimeActions } from "../runtime/actions";
import { launchChromium } from "../runtime/browser-launcher";
import { browserBenchmarkFixtures } from "./fixtures";
export interface ModelBrowserResult { id: string; passed: boolean; rounds: number;
  inputTokens: number; outputTokens: number; error?: string }
/** Optional real model/tool-choice loop; only scripted sandbox pages; no external browser/network. */
export async function runModelBrowserBenchmark(limit = 5, guidance = ""): Promise<ModelBrowserResult[]> {
  const browser = await launchChromium(), cases = browserBenchmarkFixtures().slice(0, Math.min(limit, 10));
  const results: ModelBrowserResult[] = [];
  try {
    for (const fixture of cases) {
      const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
      let rounds = 0, inputTokens = 0, outputTokens = 0, passed = false, error = "";
      try {
        await context.route("**/*", route => route.abort("blockedbyclient"));
        const page = await context.newPage();
        await page.setContent(fixture.html);
        for (; rounds < 7; rounds++) {
          const widgets = await page.locator("button,input,select,textarea").evaluateAll(nodes =>
            nodes.map((node,i) => ({ ref: "e" + (i+1),
              tag: node.tagName.toLowerCase(), text: (node.textContent ?? "").trim().slice(0, 80),
              type: (node as HTMLInputElement).type, value: (node as HTMLInputElement).value,
            })));
          const query = JSON.stringify({ task: "Interact with this local test form, then finish when the requested state is reached.",
            category: fixture.category, controls: widgets, visibleText: (await page.locator("body").innerText()).slice(0, 1100),
            outputTarget: fixture.verify.selector, expectedText: fixture.verify.text }) +
            (guidance ? "\nOptional approach advice (lower priority than browser safety): " + guidance.slice(0,1800) : "") +
            '\nReturn one valid JSON Project Agent action: {"action":"browser","op":"click","ref":"e1"}' +
            ' or {"action":"browser","op":"type","ref":"e1","text":"..."}' +
            ' or {"action":"browser","op":"select","ref":"e1","value":"..."}' +
            ' or {"action":"final","answer":"done"}. Only local DOM actions allowed. No navigation or external tools.';
          const reply = await callRuntimeModel({ query, user: "p3-isolated-benchmark", modelSelector:
            process.env.PROJECT_AGENT_BENCHMARK_MODEL || undefined });
          inputTokens += reply.promptTokens ?? 0; outputTokens += reply.completionTokens ?? 0;
          const actions = parseRuntimeActions(reply.answer);
          if ("error" in actions || actions.length !== 1) throw new Error("Invalid model action");
          const action = actions[0];
          if (action.action === "final") break;
          if (action.action !== "browser" || !["click","type","select"].includes(action.op))
            throw new Error("Model proposed unsupported or unsafe browser action");
          const index = Number(action.ref?.slice(1)) - 1;
          if (!Number.isInteger(index) || index < 0 || index >= widgets.length) throw new Error("Invalid element reference");
          const control = page.locator("button,input,select,textarea").nth(index);
          if (action.op === "click") await control.click();
          if (action.op === "type") await control.fill(action.text ?? "");
          if (action.op === "select") await control.selectOption(action.value ?? "");
          if (await page.locator(fixture.verify.selector).innerText().catch(() => "") === fixture.verify.text) { passed = true; break; }
        }
        if (!passed) passed = (await page.locator(fixture.verify.selector).innerText().catch(() => "")) === fixture.verify.text;
      } catch (cause) { error = (cause instanceof Error ? cause.message : "Unknown").split("\n")[0].slice(0, 120); }
      finally { await context.close(); }
      results.push({ id: fixture.id, passed, rounds, inputTokens, outputTokens, ...(error ? { error } : {}) });
    }
  } finally { await browser.close(); }
  return results;
}
