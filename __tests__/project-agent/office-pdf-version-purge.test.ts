import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn() }));
const storage = vi.hoisted(() => ({ deleteResourceObject: vi.fn() }));
const tiles = vi.hoisted(() => ({ forgetVersions: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceFileVersion: db } }));
vi.mock("@/lib/workspace/resource-storage", () => storage);
vi.mock("@/lib/office/pdf-tiles", () => tiles);

import { purgeVersionsBefore } from "@/lib/office/pdf-version-purge";

describe("purgeVersionsBefore", () => {
	beforeEach(() => vi.clearAllMocks());
	it("deletes every other version: rows, stored bytes and viewer copies", async () => {
		db.findMany.mockResolvedValue([{ id: "a", storageKey: "k/a" }, { id: "b", storageKey: "k/b" }]);
		expect(await purgeVersionsBefore("r1", "new")).toBe(2);
		expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { resourceId: "r1", id: { not: "new" } } }));
		expect(db.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } } });
		expect(tiles.forgetVersions).toHaveBeenCalledWith([{ id: "a", storageKey: "k/a" }, { id: "b", storageKey: "k/b" }]);
		expect(storage.deleteResourceObject.mock.calls.map((call) => call[0])).toEqual(["k/a", "k/b"]);
	});
	it("does nothing when there is no earlier version", async () => {
		db.findMany.mockResolvedValue([]);
		expect(await purgeVersionsBefore("r1", "new")).toBe(0);
		expect(db.deleteMany).not.toHaveBeenCalled();
	});
});
