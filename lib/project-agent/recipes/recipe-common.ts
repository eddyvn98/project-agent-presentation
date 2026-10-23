/** Shared helpers for the ready-made sandbox recipes: page ranges, accent folding, region arguments, JSON output and error handling. */
export const RECIPE_COMMON_PY = String.raw`import json, sys, unicodedata

def fold(text):
    plain = unicodedata.normalize("NFD", str(text).lower().replace(chr(273), "d"))
    return "".join(ch for ch in plain if not unicodedata.combining(ch))

def pages_spec(spec, total):
    """Page list from "all", "3", "1-5,8", "5-" or "last" (the last page); validated against the page count."""
    spec = str(spec or "all").strip().lower()
    if spec == "all":
        return list(range(1, total + 1))
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            lo = total if lo.strip() == "last" else int(lo or 1)
            hi = total if hi.strip() == "last" else int(hi or total)
            if lo > hi:
                raise ValueError("Page range %s runs backwards." % part)
            out += list(range(lo, hi + 1))
        else:
            out.append(total if part == "last" else int(part))
    if not out or any(n < 1 or n > total for n in out):
        raise ValueError("Pages %s are out of range: the file has %d pages." % (spec, total))
    return out

def region_arg(text):
    """"x,y,width,height" in percent of the page -> dict."""
    try:
        x, y, w, h = [float(v) for v in str(text).split(",")]
    except ValueError:
        raise ValueError("A region is four numbers x,y,width,height in percent of the page, for example 60,85,40,15.")
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 100.01 or y + h > 100.01:
        raise ValueError("The region must lie inside the page (percent, 0-100).")
    return {"x": x, "y": y, "width": w, "height": h}

def emit(result):
    print(json.dumps(result, ensure_ascii=False))

def guarded(fn):
    """Runs the recipe; any problem becomes {"error": ...} on stdout and exit code 1, so the agent reads one clear line."""
    try:
        emit(fn())
    except SystemExit:
        raise
    except Exception as exc:
        emit({"error": str(exc)[:400]})
        sys.exit(1)
`;
