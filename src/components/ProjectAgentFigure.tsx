"use client";

import { useState } from "react";
import { ProjectAgentZoomImage } from "./ProjectAgentZoomImage";

export type ImagePresentation = {
  size?: "inline" | "reference";
  caption?: string;
  source?: { url: string; label: string };
};

export function safePresentationUrl(value: string): boolean {
  return !!value && !/[\u0000-\u0020\u007f\\]/.test(value) &&
    !value.startsWith("//") && (!/^[a-z][a-z\d+.-]*:/i.test(value) || /^https?:\/\//i.test(value));
}

export function ProjectAgentFigure({ src, alt = "", presentation = {} }: {
  src: string; alt?: string; presentation?: ImagePresentation;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const caption = presentation.caption ?? alt;
  const available = safePresentationUrl(src) && failedSrc !== src;
  return <figure className="agent-figure not-prose" data-size={presentation.size ?? "reference"}>
    {available ? <ProjectAgentZoomImage src={src} alt={alt} label={`Enlarge ${alt || "illustration"}`}>
      <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
    </ProjectAgentZoomImage> : <p role="status" className="text-sm text-slate-500">Illustration unavailable{alt ? `: ${alt}` : "."}</p>}
    {(caption || presentation.source) && <figcaption>
      {caption}
      {presentation.source && safePresentationUrl(presentation.source.url) && <>{caption ? " · " : ""}<a href={presentation.source.url} target="_blank" rel="noopener noreferrer">{presentation.source.label || "Source"}</a></>}
    </figcaption>}
  </figure>;
}
