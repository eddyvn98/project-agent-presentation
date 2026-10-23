/** Bounded, exact rational arithmetic. No eval, variables, units, code or model-provided functions. */
export const MAX_CALCULATION_CHARS = 512;
const MAX_TOKENS = 128, MAX_DEPTH = 24, MAX_DIGITS = 512;
type Fraction = { n: bigint; d: bigint };
const abs = (n: bigint) => n < 0n ? -n : n;

function fraction(n: bigint, d = 1n): Fraction {
  if (!d) throw new Error("Division by zero");
  if (abs(n).toString().length > MAX_DIGITS || abs(d).toString().length > MAX_DIGITS) throw new Error("Calculation exceeds numeric limit");
  if (d < 0n) { n = -n; d = -d; }
  let a = abs(n), b = d;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  return { n: n / a, d: d / a };
}

/** Result is an integer or reduced fraction string, never a rounded floating-point value. */
export function calculateExact(expression: string): string {
  if (typeof expression !== "string" || !expression.trim() || expression.length > MAX_CALCULATION_CHARS) throw new Error("Expression must contain 1-512 characters");
  const tokens = expression.match(/\d+(?:\.\d+)?|ceil|floor|[()+*/-]|\S/g) ?? [];
  if (tokens.length > MAX_TOKENS) throw new Error("Calculation exceeds token limit");
  let at = 0;
  const take = (token: string) => tokens[at] === token && (++at > 0);
  const expect = (token: string) => { if (!take(token)) throw new Error(`Expected ${token}`); };
  function primary(depth: number): Fraction {
    if (depth > MAX_DEPTH) throw new Error("Calculation exceeds nesting limit");
    if (take("+")) return primary(depth + 1);
    if (take("-")) { const v = primary(depth + 1); return { n: -v.n, d: v.d }; }
    if (take("(")) { const v = sum(depth + 1); expect(")"); return v; }
    const token = tokens[at++];
    if (token === "ceil" || token === "floor") {
      expect("("); const v = sum(depth + 1); expect(")");
      const whole = v.n / v.d, remainder = v.n % v.d;
      return fraction(whole + (token === "ceil" && remainder > 0n ? 1n : token === "floor" && remainder < 0n ? -1n : 0n));
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) throw new Error("Expected a number, parentheses, ceil or floor");
    if (token.length > 80) throw new Error("Number literal exceeds 80 characters");
    const [integer, decimal = ""] = token.split(".");
    return fraction(BigInt(integer + decimal), 10n ** BigInt(decimal.length));
  }
  function product(depth: number): Fraction {
    let left = primary(depth);
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++], right = primary(depth);
      left = op === "*" ? fraction(left.n * right.n, left.d * right.d) : fraction(left.n * right.d, left.d * right.n);
    }
    return left;
  }
  function sum(depth: number): Fraction {
    let left = product(depth);
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++], right = product(depth);
      left = fraction(left.n * right.d + (op === "+" ? right.n : -right.n) * left.d, left.d * right.d);
    }
    return left;
  }
  const result = sum(0);
  if (at !== tokens.length) throw new Error("Unsupported or trailing expression syntax");
  return result.d === 1n ? String(result.n) : `${result.n}/${result.d}`;
}

export function runCalculation(expression: string): { text: string; failed?: boolean } {
  try { return { text: JSON.stringify({ expression, exact: calculateExact(expression), scope: "Arithmetic only; inputs, units, formula choice and answer prose are not verified." }) }; }
  catch (cause) { return { text: `Calculation failed: ${cause instanceof Error ? cause.message : "Invalid expression"}`, failed: true }; }
}
