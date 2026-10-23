/** recipes.py: lists and searches the recipe manifest so the agent loads one line of help, not the whole library. */
export const RECIPE_FINDER_PY = String.raw`"""Find a ready-made recipe. Usage: recipes.py list | find <words in any language> | show <name>"""
import json, os, subprocess, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))

def fold(text):
    plain = unicodedata.normalize("NFD", str(text).lower().replace(chr(273), "d"))
    return "".join(ch for ch in plain if not unicodedata.combining(ch))

def load():
    with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as handle:
        return json.load(handle)["recipes"]

def brief(r, full=False):
    lines = ["%s - %s" % (r["name"], r["summary"]), "  run: " + r["usage"]]
    if full:
        lines.append("  example: " + r["example"])
        lines.append("  does not do: " + r["limits"])
    return "\n".join(lines)

def score(r, words):
    hay_name, hay_tags, hay_sum = fold(r["name"]), fold(" ".join(r["tags"])), fold(r["summary"])
    total = 0
    for w in words:
        total += 3 * (w in hay_name) + 2 * (w in hay_tags) + (w in hay_sum)
    return total

def main():
    args = sys.argv[1:]
    recipes = load()
    if not args or args[0] == "list":
        print("\n".join("%s - %s" % (r["name"], r["summary"]) for r in recipes))
    elif args[0] == "find" and len(args) > 1:
        words = [w for w in fold(" ".join(args[1:])).split() if len(w) > 1]
        ranked = sorted(((score(r, words), r) for r in recipes), key=lambda x: -x[0])
        hits = [r for s, r in ranked if s > 0][:3]
        if not hits:
            print("No recipe matches. Use the pdf action or write a script. All recipes:\n" + "\n".join("%s - %s" % (r["name"], r["summary"]) for r in recipes))
        else:
            print("\n\n".join(brief(r, full=True) for r in hits))
    elif args[0] == "show" and len(args) > 1:
        match = [r for r in recipes if r["name"] == args[1]]
        if not match:
            sys.exit("Unknown recipe: %s. Run: python3 recipes/recipes.py list" % args[1])
        print(brief(match[0], full=True))
        subprocess.run([sys.executable, os.path.join(HERE, match[0]["name"] + ".py"), "--help"])
    else:
        sys.exit(__doc__)

main()
`;
