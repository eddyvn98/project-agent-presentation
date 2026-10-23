import { NextRequest, NextResponse } from "next/server";
import * as cap from "@/lib/capabilities/project";
import { resolveProjectRequestAccess } from "@/lib/projects/api-access";
import { bm25Filter } from "@/lib/bm25";
import { semanticSearch, vectorIndexExists } from "@/lib/vector-store";

export const runtime = "nodejs";

// Chars threshold above which BM25 kicks in (conservative — works for most models)
const BM25_THRESHOLD = 60_000;
const BM25_TOP_K = 8;
// Hard cap on final output — prevents oversized payloads even when BM25 can't filter
// (e.g. fewer chunks than topK). Keep well under typical model context limits.
const OUTPUT_HARD_CAP = 40_000;

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const { projectId } = params;
  const auth = await resolveProjectRequestAccess(req, projectId, "CHAT");
  if (auth.response) return auth.response;
  const query = req.nextUrl.searchParams.get("q") ?? "";

  const { textChunks } = await cap.getProjectKnowledgeContext(projectId, auth.ownerEmail!);
  const allChunks = [...textChunks];
  const fullText = allChunks.join("\n\n---\n\n");

  // Apply semantic search if index exists, otherwise fall back to BM25
  let finalText = fullText;
  let usedSemantic = false;
  if (query && allChunks.length > 0) {
    const hasIndex = await vectorIndexExists(projectId);
    if (hasIndex) {
      const chunks = await semanticSearch(projectId, query, BM25_TOP_K);
      if (chunks.length > 0) {
        finalText = chunks.join("\n\n---\n\n");
        usedSemantic = true;
      }
    } else if (fullText.length > BM25_THRESHOLD) {
      const filtered = bm25Filter(query, allChunks, BM25_TOP_K);
      finalText = filtered.join("\n\n---\n\n");
    }
  }

  // Hard cap: truncate even after BM25 if still too large
  // (happens when chunk count < topK so BM25 returns everything)
  if (finalText.length > OUTPUT_HARD_CAP) {
    finalText = finalText.slice(0, OUTPUT_HARD_CAP);
  }

  return NextResponse.json({
    text: finalText,
    filtered: query ? allChunks.length > BM25_TOP_K : false,
    semantic: usedSemantic,
    source: "server-upload",
  });
}
