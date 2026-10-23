import { vi } from "vitest";
// No container/PDF execution in this workspace. Keep actual action parsing and wait logic.
vi.mock("../../lib/project-agent/runtime/pdf-local", () => ({ runLocalPdfAction: () => { throw new Error("Host PDF execution unavailable"); } }));
