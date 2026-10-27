"use client";

import { useState } from "react";
import type { RichUiBlock } from "@/lib/project-agent/rich-ui";
import { safeProject3DViewerUrl } from "@/lib/project-agent/scene3d-policy";

type Scene3D = Extract<RichUiBlock, { type: "scene3d" }>;
/** Standalone SuperSplat/other viewer HTML remains in an opaque-origin sandbox. */
export function ProjectAgentScene3D({ block }: { block: Scene3D }) {
  const [opened, setOpened] = useState(false);
  const url = safeProject3DViewerUrl(block.viewerUrl);
  if (!url) return <p role="status">3D preview unavailable.</p>;
  return <figure className="not-prose my-5 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <figcaption className="px-4 py-3">
      <p className="text-sm font-semibold">{block.title}</p>
      {block.caption && <p className="mt-1 text-xs text-slate-500">{block.caption}</p>}
    </figcaption>
    {opened ? <div>
      <iframe src={url} title={block.title} loading="lazy"
        sandbox="allow-scripts" referrerPolicy="no-referrer"
        className="aspect-video w-full border-t border-slate-200"
        aria-label={block.title + " interactive 3D viewer"} />
      <div className="p-3"><button type="button" onClick={() => setOpened(false)}
        className="rounded-lg border px-3 py-2 text-sm">Close 3D viewer</button></div>
    </div> : <div className="border-t border-slate-200 p-4">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Interactive 3D preview. Opening may use WebGL and local model assets.
      </p>
      <button type="button" onClick={() => setOpened(true)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
        Open 3D viewer
      </button>
    </div>}
  </figure>;
}
