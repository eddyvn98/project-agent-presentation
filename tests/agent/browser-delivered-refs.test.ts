import { describe, expect, it } from "vitest";
import { bindDeliveredBrowserRefs } from "../../lib/project-agent/runtime/browser-agent/delivered-refs";

describe("Delivered browser refs", () => {
  it("rejects refs absent from the delivered snapshot", () => {
    const target = new Map([["e0", "#old"]]);
    bindDeliveredBrowserRefs(target, new Map([["e1", "#one"], ["e2", "#two"]]),
      '[ref=e1] button "OK"\n...more below', true);
    expect([...target.entries()]).toEqual([["e1", "#one"]]);
  });
  it("rejects ref embedded inside an untrusted label", () => {
    const target = new Map<string, string>();
    bindDeliveredBrowserRefs(target, new Map([["e1", "#one"], ["e2", "#two"]]),
      '[ref=e1] button "Continue [ref=e2]"', true);
    expect([...target.keys()]).toEqual(["e1"]);
  });
  it("keeps legacy mode unchanged", () => {
    const target = new Map([["e0", "#old"]]);
    bindDeliveredBrowserRefs(target, new Map([["e1", "#one"]]), "", false);
    expect([...target.keys()]).toEqual(["e0", "e1"]);
  });
});
