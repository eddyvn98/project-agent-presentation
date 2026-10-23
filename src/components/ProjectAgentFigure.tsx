"use client";

import { useState } from "react";
import { ImageOff, Maximize2 } from "lucide-react";
import { ProjectAgentZoomImage } from "./ProjectAgentZoomImage";
import { safePresentationUrl } from "./presentation-source-utils";
import "./presentation-visuals.css";

export { safePresentationUrl } from "./presentation-source-utils";

export type ImagePresentation = {
  size?: "inline" | "reference";
  caption?: string;
  source?: { url: string; label: string };
  /** Optional intrinsic dimensions reserve space while the host-supplied image loads. */
  width?: number;
  height?: number;
};

export function ProjectAgentFigure({ src, alt = "", presentation = {} }: {
  src: string; alt?: string; presentation?: ImagePresentation;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const caption = presentation.caption ?? alt;
  const available = safePresentationUrl(src) && failedSrc !== src;
  const width = Number.isFinite(presentation.width) && presentation.width! > 0 ? presentation.width : undefined;
  const height = Number.isFinite(presentation.height) && presentation.height! > 0 ? presentation.height : undefined;
  const source = presentation.source && safePresentationUrl(presentation.source.url) ? presentation.source : undefined;
  return <figure className="agent-figure not-prose" data-size={presentation.size ?? "reference"}
    aria-busy={available && loadedSrc !== src ? true : undefined}>
    {available ? <ProjectAgentZoomImage src={src} alt={alt} label={`Enlarge ${alt || "illustration"}`}
      caption={caption} source={source} className="agent-figure-trigger">
      <span className="agent-figure-frame" data-loading={loadedSrc !== src || undefined}>
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} />
        <span aria-hidden className="agent-figure-enlarge"><Maximize2 className="h-3.5 w-3.5" />Enlarge</span>
      </span>
    </ProjectAgentZoomImage> : <div className="agent-figure-unavailable">
      <ImageOff aria-hidden className="h-5 w-5" />
      <p role="status">Illustration unavailable{alt ? `: ${alt}` : "."}</p>
    </div>}
    {(caption || presentation.source) && <figcaption>
      {caption}
      {source && <>{caption ? " · " : ""}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.label || "Source"}</a></>}
    </figcaption>}
  </figure>;
}
