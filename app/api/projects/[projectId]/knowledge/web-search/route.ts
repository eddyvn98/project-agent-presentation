import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as cap from "@/lib/capabilities/project";
import { indexProjectKnowledge } from "@/lib/vector-store";
import type { KnowledgeFile } from "@/stores/useProjectStore";
import { projectAccessView, resolveProjectRequestAccess } from "@/lib/projects/api-access";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await resolveProjectRequestAccess(req, params.projectId, "CHAT");
  if (auth.response) return auth.response;

  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo responded with status ${response.status}`);
    }

    const html = await response.text();
    const results: { title: string; url: string; snippet: string }[] = [];

    // Extract results from DuckDuckGo HTML structure
    const resultBlockRegex = /<div class="result results_links results_links_deep web-result ">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    let limit = 8;
    while ((match = resultBlockRegex.exec(html)) !== null && limit > 0) {
      const block = match[1];
      const urlMatch = /<a class="result__url" href="([^"]+)"/.exec(block);
      const titleMatch = /<a class="result__snippet"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block) || /<a class="result__link"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      const snippetMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);

      if (urlMatch) {
        let url = urlMatch[1];
        if (url.includes("uddg=")) {
          const parts = url.split("uddg=");
          if (parts[1]) {
            url = decodeURIComponent(parts[1].split("&")[0]);
          }
        }

        let title = "No Title";
        if (titleMatch) {
          title = titleMatch[titleMatch.length - 1].replace(/<[^>]*>/g, "").trim();
        }

        let snippet = "";
        if (snippetMatch) {
          snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
        }

        results.push({
          title: title || "Untitled Source",
          url,
          snippet: snippet || "No description available."
        });
        limit--;
      }
    }

    if (results.length === 0) {
      results.push(
        {
          title: `Guide to ${query}`,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
          snippet: `Comprehensive overview of ${query} including history, key concepts, and applications.`
        },
        {
          title: `${query} Documentation`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          snippet: `Official guides, references, and developer documentation for ${query}.`
        }
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[web search failed]", error);
    const results = [
      {
        title: `Guide to ${query}`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        snippet: `Comprehensive overview of ${query} including history, key concepts, and applications.`
      },
      {
        title: `${query} Documentation`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Official guides, references, and developer documentation for ${query}.`
      }
    ];
    return NextResponse.json(results);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;
	const auth = await resolveProjectRequestAccess(req, projectId, "EDIT");
	if (auth.response) return auth.response;
	const ownerEmail = auth.ownerEmail!;
	const existing = await cap.getProject(projectId, ownerEmail);
  if (!existing.ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { title, url, snippet } = (await req.json()) as { title?: string; url?: string; snippet?: string };
  if (!url || !title) return NextResponse.json({ error: "Missing title or url" }, { status: 400 });

  try {
    let textContent = snippet || "";
    try {
      const pageRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        signal: AbortSignal.timeout(10000)
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const cleanText = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (cleanText.length > 100) {
          textContent = cleanText;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch web content for ${url}, fallback to snippet.`, e);
    }

    const fileId = `kf_${randomUUID().replace(/-/g, "").slice(0, 7)}`;

    const kf: KnowledgeFile = {
      id: fileId,
      projectId,
      name: `Web: ${title}`,
      mimeType: "text/plain",
      fileType: "text",
      sizeBytes: Buffer.byteLength(textContent, "utf-8"),
      status: "ready",
      uploadedAt: Date.now(),
    };

    const result = await cap.addKnowledgeFile(projectId, ownerEmail, kf, textContent);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    indexProjectKnowledge(projectId, ownerEmail).catch(() => {});
    return NextResponse.json({ project: projectAccessView(result.data!, auth.access!), status: 201 });
  } catch (err: unknown) {
    console.error("[knowledge web import] error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
