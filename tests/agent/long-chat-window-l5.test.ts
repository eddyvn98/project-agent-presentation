import { describe, expect, it } from "vitest";
import { LONG_CHAT_BATCH, longChatWindow } from "../../lib/project-agent/long-chat-window";
describe("L5 bounded long-session render window", () => {
  it.each([1000, 5000])("does not mount all %i expensive responses", count => {
    const data = Array.from({ length: count }, (_, i) => ({
      id: "turn-" + i, text: i % 7 === 0 ? "mermaid chart code markdown" : "text",
    }));
    expect(longChatWindow(data)).toHaveLength(LONG_CHAT_BATCH);
    expect(longChatWindow(data)[0].id).toBe("turn-" + (count - LONG_CHAT_BATCH));
    expect(longChatWindow(data, 160).at(-1)).toEqual(data.at(-1));
    expect(new Set(longChatWindow(data, 240).map(x => x.id)).size).toBe(240);
  });
  it("handles shorter histories and invalid limits without dropping the current turn", () => {
    expect(longChatWindow([1, 2, 3])).toEqual([1, 2, 3]);
    expect(longChatWindow([1, 2, 3], 0)).toEqual([3]);
    expect(longChatWindow([1, 2, 3], Number.POSITIVE_INFINITY)).toEqual([1, 2, 3]);
  });
});
