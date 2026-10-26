import { describe, expect, it } from "vitest";
import { bindDeliveredBrowserRefs } from "../../lib/project-agent/runtime/browser-agent/delivered-refs";

describe("Delivered browser refs", () => {
  it("rejects refs absent from the delivered snapshot", () => {
    const target = new Map([["e0", "#old"]]);
    bindDeliveredBrowserRefs(target, new Map([["e1", "#one"], ["e2", "#two"]]),
      '[ref=e1] button "OK"\n...more below', true);
    expect([...target.entries()]).toEqual([["e1", "#one"]]);
  });
  it("keeps legacy mode unchanged", () => {
    const target = new Map([["e0", "#old"]]);
    bindDeliveredBrowserRefs(target, new Map([["e1", "#one"]]), "", false);
    expect([...target.keys()]).toEqual(["e0", "e1"]);
  });
});
