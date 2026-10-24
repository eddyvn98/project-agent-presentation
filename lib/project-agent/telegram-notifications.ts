import { createHash, randomBytes } from "node:crypto";
import { getMongoAiDb } from "@/services/mongodb/client";
import { masterVaultKey, seal, unseal, type SealedPayload } from "./runtime/browser-agent/personal-vault-crypto";
interface Link {
  _id: string; owner: string; state: "pending" | "connected";
  pendingHash?: string; expiresAt?: Date; chatCipher?: SealedPayload;
  connectedAt?: string;
}
const ownerId = (s: string) => s.trim().toLowerCase();
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
async function links() {
  return (await getMongoAiDb()).collection<Link>("projectAgentTelegramLinks");
}
function configured() {
  const token = process.env.PROJECT_AGENT_TELEGRAM_BOT_TOKEN ?? "";
  const username = process.env.PROJECT_AGENT_TELEGRAM_BOT_USERNAME ?? "";
  if (!token || !/^[a-zA-Z0-9_]{4,50}$/.test(username) ||
    (process.env.PROJECT_AGENT_TELEGRAM_WEBHOOK_SECRET ?? "").length < 32)
    throw new Error("Telegram notifications not configured on host");
  return { token, username };
}
export async function notificationLinkStatus(owner: string) {
  let username = "";
  try { username = configured().username; } catch { /* feature disabled */ }
  const item = await (await links()).findOne({ _id: ownerId(owner) });
  return { available: Boolean(username), connected: item?.state === "connected", username };
}
export async function beginTelegramLink(owner: string) {
  const { username } = configured(); masterVaultKey();
  const code = "pa_" + randomBytes(24).toString("hex");
  await (await links()).updateOne({ _id: ownerId(owner) },
    { $set: { owner: ownerId(owner), state: "pending" as const, pendingHash: digest(code),
      expiresAt: new Date(Date.now() + 15*60_000) },
      $unset: { chatCipher: "", connectedAt: "" } }, { upsert: true });
  return { link: "https://t.me/" + username + "?start=" + code,
    expiresAt: new Date(Date.now()+15*60_000).toISOString() };
}
export async function completeTelegramLink(code: string, chatId: string): Promise<boolean> {
  if (!/^pa_[a-f0-9]{48}$/.test(code) || !/^-?\d{1,20}$/.test(chatId)) return false;
  const coll = await links(), found = await coll.findOne({
    state: "pending", pendingHash: digest(code), expiresAt: { $gt: new Date() },
  });
  if (!found) return false;
  const cipher = seal(Buffer.from(chatId), masterVaultKey(), "project-agent:telegram:" + found.owner);
  const result = await coll.updateOne({
    _id: found._id, state: "pending", pendingHash: digest(code), expiresAt: { $gt: new Date() },
  }, { $set: { chatCipher: cipher, state: "connected", connectedAt: new Date().toISOString() },
    $unset: { pendingHash: "", expiresAt: "" } });
  return result.modifiedCount === 1;
}
export async function unlinkTelegram(owner: string) {
  await (await links()).deleteOne({ _id: ownerId(owner) });
}
export async function sendTelegramAgentNotice(owner: string, category: string): Promise<boolean> {
  if (process.env.PROJECT_AGENT_TELEGRAM_NOTICES !== "1") return false;
  const { token } = configured();
  const row = await (await links()).findOne({ _id: ownerId(owner), state: "connected" });
  if (!row?.chatCipher) return false;
  const chat = unseal(row.chatCipher, masterVaultKey(), "project-agent:telegram:" + ownerId(owner)).toString("utf8");
  const label = ["finished","failed","approval","workflow"].includes(category) ? category : "activity";
  const result = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: "Project Agent: " + label +
      ". Open your Agent Control Center to see details." }), signal: AbortSignal.timeout(12000),
  });
  return result.ok;
}
