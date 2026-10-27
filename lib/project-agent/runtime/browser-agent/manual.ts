import { activeBrowserSession, withBrowserOp } from "./session";
import { projectBrowserOperation } from "./project-sessions";
import { resolveTaskBrowser, taskBrowserControlStatus } from "./task-browser";
import { randomUUID } from "node:crypto";
import type { Page } from "playwright-core";
import { beginBrowserIntervention, completeBrowserIntervention, notifyBrowserIntervention, claimHumanBrowserAction, takeBrowserControl, releaseBrowserControl, keepBrowserControl } from "./control";
import { noteBrowserLoopTakeover, noteBrowserLoopHandback } from "./loop-state";
import { browserWatchStatus, captureBrowserWatch, setBrowserWatch } from "./watch";
import { assertSharedFrame, clearSharedFrame, sharedActivePage } from "./shared-frame";

export type HumanBrowserAction =
  | { op: "takeover" | "release" | "heartbeat" }
  | { op: "click"; x: number; y: number; frame: number; frameId?: string; approvalTicket?: string }
  | { op: "scroll"; direction: "up" | "down" }
  | { op: "type"; text: string }
  | { op: "key"; key: "Tab" | "Escape" | "Backspace" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Enter" };

interface RiskChallengeState { ticket: string; frame: number; x: number; y: number; expires: number }
const challenges = new Map<string, RiskChallengeState>();
class RiskChallenge extends Error { constructor(readonly ticket: string) { super("Confirm this high-impact control before proceeding"); } }
export function parseHumanBrowserAction(value: unknown): HumanBrowserAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.op === "takeover" || raw.op === "release" || raw.op === "heartbeat") return { op: raw.op };
  if (raw.op === "click" && typeof raw.x === "number" && typeof raw.y === "number" &&
    Number.isFinite(raw.x) && Number.isFinite(raw.y) && raw.x >= 0 && raw.x <= 1 && raw.y >= 0 && raw.y <= 1 && typeof raw.frame === "number" && Number.isSafeInteger(raw.frame) && raw.frame > 0)
    return { op: "click", x: raw.x, y: raw.y, frame: raw.frame,
      frameId: typeof raw.frameId === "string" && /^[a-f0-9-]{36}$/.test(raw.frameId) ? raw.frameId : undefined,
      approvalTicket: typeof raw.approvalTicket === "string" && /^[a-f0-9-]{36}$/.test(raw.approvalTicket) ? raw.approvalTicket : undefined };
  if (raw.op === "scroll" && (raw.direction === "up" || raw.direction === "down")) return { op: "scroll", direction: raw.direction };
  if (raw.op === "type" && typeof raw.text === "string" && raw.text.length >= 1 && raw.text.length <= 600 && !/[\x00-\x08\x0b-\x1f]/.test(raw.text)) return { op: "type", text: raw.text };
  if (raw.op === "key" && ["Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(String(raw.key))) return { op: "key", key: raw.key as Extract<HumanBrowserAction, {op:"key"}>["key"] };
  return null;
}
function safeTarget(value: string): boolean {
  return !/\b(pay|purchase|place order|checkout|buy now|delete|remove account|publish|send message|transfer|withdraw|confirm payment|subscribe|book now)\b|(?:thanh toán|đặt hàng|xóa tài khoản|chuyển tiền|gửi tin nhắn|đăng bài)/iu.test(value); // vi-allow: localized text or locale detection
}
async function privateLoginHasFocus(page: Page): Promise<boolean> {
  const inspect = () => page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return Boolean(el && (el.type === "password" || /password|otp|one.time|secret|token/i.test(
      [el.autocomplete, el.name, el.id].join(" "))));
  });
  try { return await inspect(); }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (!/execution context was destroyed|cannot find context with specified id/i.test(message)) throw cause;
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    try { return await inspect(); }
    catch (retryCause) {
      const retryMessage = retryCause instanceof Error ? retryCause.message : "";
      if (/execution context was destroyed|cannot find context with specified id/i.test(retryMessage)) return false;
      throw retryCause;
    }
  }
}
export async function humanBrowserOperation(taskId: string, chatId: string, action: HumanBrowserAction,
  project?: { projectId: string; owner: string }) {
  const session = project ?
    await resolveTaskBrowser(taskId, project.projectId, project.owner) : activeBrowserSession(chatId);
  if (!session) return { error: "Agent has not opened a browser session or task control expired" };
  if (project && session.owner && session.owner !== project.owner.trim().toLowerCase())
    return { error: "Browser owner mismatch" };
  if (action.op === "heartbeat") {
    try {
      const renewed = session.persistent ?
        (await projectBrowserOperation(session, { op: "heartbeat" }), true) : keepBrowserControl(taskId);
      if (!renewed) return { error: "Browser takeover expired" };
      return { ok: true, paused: true };
    } catch { return { error: "Browser takeover expired" }; }
  }
  if (action.op === "release" || action.op === "takeover") {
    challenges.delete(taskId);
    try {
      if (session.persistent) {
        await projectBrowserOperation(session, { op: action.op });
        if (action.op === "takeover") noteBrowserLoopTakeover(taskId);
        else noteBrowserLoopHandback(taskId);
      } else if (action.op === "takeover") {
        takeBrowserControl(taskId);
        try { await withBrowserOp(session, async () => {}, false, "system"); }
        catch (cause) { releaseBrowserControl(taskId); throw cause; }
      } else releaseBrowserControl(taskId);
      if (action.op === "release") await clearSharedFrame(taskId);
      if (action.op === "takeover") {
        if (!browserWatchStatus(taskId)?.watching) setBrowserWatch(taskId, true);
        await captureBrowserWatch(taskId, session.page, "human_takeover");
        notifyBrowserIntervention(taskId);
      }
      return { ok: true, paused: action.op === "takeover" };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message.slice(0, 180) : "Browser control failed" };
    }
  }
  if (!(await taskBrowserControlStatus(taskId, project?.projectId, project?.owner)).paused)
    return { error: "Take control before interacting with the browser" };
  if (!claimHumanBrowserAction(taskId)) return { error: "Manual browser action limit reached; try again in a few minutes." };
  beginBrowserIntervention(taskId);
  let marker: { x: number; y: number; kind: "human" } | undefined;
  let privateLoginRequired = false;
  try {
    await withBrowserOp(session, async () => {
      const page = session.persistent ? (await sharedActivePage(session))?.page : session.page;
      if (!page) throw new Error("Active browser tab unavailable");
      if (action.op === "click") {
        if (session.persistent) {
          if (!action.frameId || !project) throw new Error("Verified browser frame required");
          await assertSharedFrame(session, taskId, project.owner, action.frameId, page);
        } else if (!browserWatchStatus(taskId)?.watching || browserWatchStatus(taskId)?.sequence !== action.frame)
          throw new Error("The screenshot is stale; refresh the live Browser Watch frame");
        const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
        const x = Math.round(action.x * viewport.width), y = Math.round(action.y * viewport.height);
        const target = await page.evaluate(({ px, py }) => {
          const element = document.elementFromPoint(px, py) as HTMLElement | null;
          const clickable = element?.closest("button,a,[role=button],input,[role=link]") as HTMLElement | null;
          return { tag: element?.tagName ?? "", label: ((clickable ?? element)?.getAttribute("aria-label") ?? "") + " " + ((clickable ?? element)?.textContent ?? "").slice(0, 180) };
        }, { px: x, py: y });
        if (target.tag === "IFRAME") throw new Error("Cannot click into an embedded cross-origin frame");
        if (!safeTarget(target.label)) {
          const pending = challenges.get(taskId);
          if (!pending || pending.expires < Date.now() || pending.frame !== action.frame ||
              pending.x !== action.x || pending.y !== action.y || pending.ticket !== action.approvalTicket) {
            const ticket = randomUUID();
            challenges.set(taskId, { ticket, frame: action.frame, x: action.x, y: action.y, expires: Date.now() + 45_000 });
            throw new RiskChallenge(ticket);
          }
          challenges.delete(taskId);
        }
        if (session.persistent) await clearSharedFrame(taskId);
        await page.mouse.click(x, y);
        privateLoginRequired = await privateLoginHasFocus(page);
        marker = { x: action.x, y: action.y, kind: "human" };
      } else if (action.op === "scroll") {
        await page.mouse.wheel(0, action.direction === "down" ? 540 : -540);
      } else if (action.op === "type") {
        const focus = await page.evaluate(() => {
          const el = document.activeElement as HTMLInputElement | null;
          return { tag: el?.tagName.toLowerCase(), type: el?.getAttribute("type") ?? "",
            autocomplete: el?.getAttribute("autocomplete") ?? "", name: el?.getAttribute("name") ?? "" };
        });
        if (!["input", "textarea"].includes(focus.tag ?? "") ||
          /password|cc-|cvc|cvv|card|otp|one.time|ssn|token|secret|bank|government/i.test([focus.type, focus.autocomplete, focus.name].join(" ")))
          throw new Error("Select a non-sensitive text input. Password, payment and security-code entry are not supported.");
        await page.keyboard.insertText(action.text);
      } else if (action.op === "key") {
        if (action.key === "Enter") {
          const searchField = await page.evaluate(() => {
            const el = document.activeElement as HTMLInputElement | null;
            return Boolean(el && (el.type === "search" || el.getAttribute("role") === "searchbox" ||
              /search/i.test([el.name, el.id, el.getAttribute("aria-label")].join(" "))));
          });
          if (!searchField) throw new Error("Enter is allowed only in a search field; use a visible page button to submit other forms.");
        }
        await page.keyboard.press(action.key);
        privateLoginRequired = await page.evaluate(() => {
          const el = document.activeElement as HTMLInputElement | null;
          return Boolean(el && (el.type === "password" || /password|otp|one.time|secret|token/i.test(
            [el.autocomplete, el.name, el.id].join(" "))));
        });
      }
      await captureBrowserWatch(taskId, page, "human_" + action.op, marker);
    }, false, "human");
    return { ok: true, paused: false, ...(privateLoginRequired ? { privateLoginRequired: true } : {}) };
  } catch (cause) {
    if (cause instanceof RiskChallenge) return { error: cause.message, approvalTicket: cause.ticket };
    return { error: cause instanceof Error ? cause.message.slice(0, 180) : "Manual browser action could not finish" };
  } finally { completeBrowserIntervention(taskId); }
}
