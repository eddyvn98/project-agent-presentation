import type { Plugin } from "vite";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DESIGN_SCRIPT } from "../lib/project-agent/runtime/design-script";
import { parseDesignSpec, type DesignSpec } from "../lib/project-agent/runtime/design-model";
import { parseDesignEdits, applyDesignEdits } from "../lib/project-agent/runtime/design-edit";
import { INTERACTIVE_HTML_CSP } from "../lib/project-agent/interactive-html";

const ORIGINAL = "design-abcdefabcdef";
const FILE_NAME = /^design-[a-f0-9]{12}\.(?:design\.json|dxf|pdf|glb|preview\.png|web\.html)$/;
const SOURCE_NAME = /^outputs\/(design-[a-f0-9]{12})\.design\.json$/;
const TYPES: Record<string, string> = {
  "design.json": "application/json", "dxf": "image/vnd.dxf",
  "pdf": "application/pdf", "glb": "model/gltf-binary",
  "preview.png": "image/png", "web.html": "text/html; charset=utf-8",
};
const FIXTURE = {
  title: "Real interior QA", units: "mm",
  room: { width: 6000, depth: 4500, height: 3000, wallThickness: 150 },
  openings: [{ wall: "south", kind: "door", offset: 300, width: 900, height: 2100, sill: 0 }],
  furniture: [{ kind: "table", x: 3000, y: 2200, width: 1500, depth: 800,
    height: 750, rotation: 0, label: "Meeting table" }],
};

function extension(name: string) {
  return Object.keys(TYPES).find(key => name.endsWith("." + key)) ?? "";
}
function json(res: import("node:http").ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
}

/** Isolated Vite-only QA bridge. Generates real artifacts and replays actual typed design edits. */
export function realDesignQaPlugin(): Plugin {
  const root = mkdtempSync(path.join(tmpdir(), "agent-real-design-qa-"));
  const script = path.join(root, "export.py");
  const models = new Map<string, DesignSpec>();
  let initialized = false;
  function exportDesign(spec: DesignSpec, name: string) {
    const input = path.join(root, name + ".input.json");
    writeFileSync(input, JSON.stringify(spec), { flag: "wx" });
    const result = spawnSync("python3", [script, input, name], {
      timeout: 20000, encoding: "utf8", maxBuffer: 300_000,
    });
    if (result.status !== 0) throw Error("Real design export failed: " + result.stderr);
    const receipt = JSON.parse(result.stdout) as { files?: string[] };
    const expected = Object.keys(TYPES).map(ext => "outputs/" + name + "." + ext);
    if (!Array.isArray(receipt.files) || expected.some(f => !receipt.files!.includes(f)))
      throw Error("Real exporter returned an incomplete artifact set.");
    for (const item of expected) {
      const file = path.join(root, path.basename(item));
      if (!statSync(file).size) throw Error("Real exporter produced an empty artifact: " + item);
    }
    models.set(name, spec);
    return expected;
  }
  function initialize() {
    if (initialized) return;
    const old = 'output = "/work/outputs"';
    if (!DESIGN_SCRIPT.includes(old)) throw Error("The exporter no longer has the expected output root.");
    writeFileSync(script, DESIGN_SCRIPT.replace(old, "output = " + JSON.stringify(root)), { flag: "wx" });
    const parsed = parseDesignSpec(FIXTURE);
    if ("error" in parsed) throw Error(parsed.error);
    exportDesign(parsed.spec, ORIGINAL);
    initialized = true;
  }
  return {
    name: "agent-real-design-e2e-only",
    configureServer(server) {
      initialize();
      server.httpServer?.once("close", () => rmSync(root, { recursive: true, force: true }));
      server.middlewares.use("/api/qa/design-real", async (req, res, next) => {
        const requestUrl = new URL(req.url || "/", "http://qa.local");
        if (req.method === "GET" && requestUrl.pathname === "/models") {
          const files = [...models.keys()].flatMap(name => Object.keys(TYPES).map(ext => {
            const file = name + "." + ext;
            return { id: file, name: file, size: statSync(path.join(root, file)).size,
              mimeType: TYPES[ext] };
          }));
          return json(res, 200, { files, original: ORIGINAL });
        }
        if (req.method === "POST" && requestUrl.pathname === "/revise") {
          try {
            let body = "";
            for await (const chunk of req) {
              body += chunk.toString();
              if (body.length > 20_000) return json(res, 413, { error: "Request too large" });
            }
            const payload = JSON.parse(body) as { action?: string; source?: string; edits?: unknown };
            const match = SOURCE_NAME.exec(payload.source ?? "");
            if (payload.action !== "design_edit" || !match || !models.has(match[1]))
              return json(res, 400, { error: "Invalid design revision source" });
            const edits = parseDesignEdits(payload.edits);
            if ("error" in edits) return json(res, 422, edits);
            const nextDesign = applyDesignEdits(models.get(match[1]), edits.edits);
            if ("error" in nextDesign) return json(res, 422, nextDesign);
            const id = "design-" + randomBytes(6).toString("hex");
            exportDesign(nextDesign.spec, id);
            return json(res, 201, { id, source: match[1], files: Object.keys(TYPES).map(ext => id + "." + ext) });
          } catch (error) {
            return json(res, 500, { error: error instanceof Error ? error.message : "Revision failed" });
          }
        }
        if (req.method === "GET" && requestUrl.pathname.startsWith("/files/")) {
          return serveFile(requestUrl.pathname.slice("/files/".length), res);
        }
        next();
      });
      server.middlewares.use("/api/projects/qa/agent/tasks/qa/files", (req, res, next) => {
        if (req.method === "GET") return serveFile(decodeURIComponent(req.url?.split("?")[0].slice(1) || ""), res);
        next();
      });
      function serveFile(name: string, res: import("node:http").ServerResponse) {
        if (!FILE_NAME.test(name) || !models.has(name.slice(0, "design-xxxxxxxxxxxx".length)))
          return json(res, 404, { error: "Design file not found" });
        try {
          const bytes = readFileSync(path.join(root, name));
          const kind = extension(name);
          res.writeHead(200, {
            "Content-Type": TYPES[kind], "Content-Length": bytes.length,
            "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
            ...(kind === "web.html" ? { "Content-Security-Policy": INTERACTIVE_HTML_CSP } : {}),
          });
          res.end(bytes);
        } catch {
          json(res, 404, { error: "Artifact not found" });
        }
      }
    },
  };
}
