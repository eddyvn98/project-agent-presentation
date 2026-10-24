import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("../../services/mongodb/client", () => ({ getMongoAiDb: vi.fn() }));
import { getMongoAiDb } from "../../services/mongodb/client";
import { assertActiveTaskLease, runWithLeaseFence } from "../../lib/project-agent/lease-fence";
afterEach(() => vi.resetAllMocks());
describe("P5 Mongo lease fencing", () => {
  it("keeps queue-disabled tasks unchanged", async () => {
    await expect(assertActiveTaskLease()).resolves.toBeUndefined();
    expect(getMongoAiDb).not.toHaveBeenCalled();
  });
  it("permits actions with matching active token only", async () => {
    const findOne = vi.fn().mockResolvedValue({ _id: "pat_123456789abc" });
    vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => ({ findOne }) } as never);
    await runWithLeaseFence({ taskId: "pat_123456789abc", token: "lease-A" }, assertActiveTaskLease);
    expect(findOne.mock.calls[0][0]).toMatchObject({
      _id: "pat_123456789abc", leaseToken: "lease-A", state: "running",
    });
  });
  it("blocks expired or replaced leases", async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    vi.mocked(getMongoAiDb).mockResolvedValue({ collection: () => ({ findOne }) } as never);
    await expect(runWithLeaseFence({ taskId: "pat_123456789abc", token: "old" },
      assertActiveTaskLease)).rejects.toThrow(/lease expired or changed/);
  });
  it("fails closed on Mongo connectivity failures", async () => {
    vi.mocked(getMongoAiDb).mockRejectedValue(new Error("connection refused"));
    await expect(runWithLeaseFence({ taskId: "pat_123456789abc", token: "lost" },
      assertActiveTaskLease)).rejects.toThrow(/connection refused/);
  });
});
