/** Stable within a browser lease, different after reviewed recovery. */
export function g2InitialRef(epoch) {
  if (epoch == null) return 1;
  if (!Number.isSafeInteger(epoch) || epoch < 1 || epoch > 100_000)
    throw new Error("Invalid G2 browser epoch");
  return epoch * 1_000_000 + 1;
}
