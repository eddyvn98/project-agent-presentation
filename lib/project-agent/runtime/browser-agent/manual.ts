import { activeBrowserSession, withBrowserOp } from "./session";
import { randomUUID } from "node:crypto";
import { changeG2HumanControl } from "./g2-ownership";
import { browserControlState, requestBrowserTakeover, releaseBrowserControl, claimHumanBrowserAction } from "./control";
import { browserWatchStatus, captureBrowserWatch, setBrowserWatch } from "./watch";

export type HumanBrowserAction =
  | { op: "takeover" | "release" }
  | { op: "click"; x: number; y: number; frame: number; approvalTicket?: string }
  | { op: "scroll"; direction: "up" | "down" }
  | { op: "type"; text: string }
  | { op: "key"; key: "Tab" | "Escape" | "Backspace" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" };

interface RiskChallengeState { ticket: string; frame: number; x: number; y: number; expires: number }
const challenges = new Map<string, RiskChallengeState>();
class RiskChallenge extends Error { constructor(readonly ticket: string) { super("Confirm this high-impact control before proceeding"); } }
export function parseHumanBrowserAction(value: unknown): HumanBrowserAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.op === "takeover" || raw.op === "release") return { op: raw.op };
  if (raw.op === "click" && typeof raw.x === "number" && typeof raw.y === "number" &&
    Number.isFinite(raw.x) && Number.isFinite(raw.y) && raw.x >= 0 && raw.x <= 1 && raw.y >= 0 && raw.y <= 1 && typeof raw.frame === "number" && Number.isSafeInteger(raw.frame) && raw.frame > 0)
    return { op: "click", x: raw.x, y: raw.y, frame: raw.frame,
      approvalTicket: typeof raw.approvalTicket === "string" && /^[a-f0-9-]{36}$/.test(raw.approvalTicket) ? raw.approvalTicket : undefined };
  if (raw.op === "scroll" && (raw.direction === "up" || raw.direction === "down")) return { op: "scroll", direction: raw.direction };
  if (raw.op === "type" && typeof raw.text === "string" && raw.text.length >= 1 && raw.text.length <= 600 && !/[\x00-\x08\x0b-\x1f]/.test(raw.text)) return { op: "type", text: raw.text };
  if (raw.op === "key" && ["Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(String(raw.key))) return { op: "key", key: raw.key as Extract<HumanBrowserAction, {op:"key"}>["key"] };
  return null;
}
function safeTarget(value: string): boolean {
  return !/\b(pay|purchase|place order|checkout|buy now|delete|remove account|publish|send message|transfer|withdraw|confirm payment|subscribe|book now)\b|(?:thanh toán|đặt hàng|xóa tài khoản|chuyển tiền|gửi tin nhắn|đăng bài)/iu.test(value);
}
export async function humanBrowserOperation(taskId: string, chatId: string, action: HumanBrowserAction) {
  const session = activeBrowserSession(chatId);
  if (!session) return { error: "Agent has not opened a browser session yet" };
  if (action.op === "release") {
    challenges.delete(taskId);
    try { await withBrowserOp(session, async () => {}, false); } catch { /* handback should not strand Agent */ }
    await changeG2HumanControl(session, "human", "agent");
    session.refs.clear(); session.snapshotUrl = ""; session.lastSnapshot = "";
    releaseBrowserControl(taskId);
    return { ok: true, paused: false };
  }
  if (action.op === "takeover") {
    challenges.delete(taskId);
    if (!browserWatchStatus(taskId)?.watching) setBrowserWatch(taskId, true);
    await changeG2HumanControl(session, "agent", "human");
    requestBrowserTakeover(taskId);
    try { await withBrowserOp(session, async () => {}, false); }
    catch { await changeG2HumanControl(session, "human", "agent").catch(() => {}); releaseBrowserControl(taskId); return { error: "The browser is busy or unavailable; takeover was cancelled" }; }
    await captureBrowserWatch(taskId, session.page, "human_takeover");
    return { ok: true, paused: true };
  }
  if (!browserControlState(taskId).paused) return { error: "Take control before interacting with the browser" };
  if (!claimHumanBrowserAction(taskId)) return { error: "Manual browser action limit reached; hand control back to Agent." };
  let marker: { x: number; y: number; kind: "human" } | undefined;
  try {
    await withBrowserOp(session, async () => {
      const page = session.page;
      if (action.op === "click") {
        if (!browserWatchStatus(taskId)?.watching || browserWatchStatus(taskId)?.sequence !== action.frame)
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
        await page.mouse.click(x, y);
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
        await page.keyboard.press(action.key);
      }
    }, false);
    await captureBrowserWatch(taskId, session.page, "human_" + action.op, marker);
    return { ok: true, paused: true };
  } catch (cause) {
    if (cause instanceof RiskChallenge) return { error: cause.message, approvalTicket: cause.ticket };
    return { error: cause instanceof Error ? cause.message.slice(0, 180) : "Manual browser action could not finish" };
  }
}
