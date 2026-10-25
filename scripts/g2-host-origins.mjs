/** Validate exact QA loopback origins, never guess from a proxy's Host header. */
export function g2HostOrigins(env) {
  const parse = (value, port) => {
    if (!value) throw new Error("Missing G2 isolated QA origin");
    const url = new URL(value);
    if (url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.port !== port || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash ||
        value !== url.origin)
      throw new Error("G2 requires a bare exact HTTP loopback origin on port " + port);
    return url;
  };
  const a = parse(env.P7_HOST_BASE_URL, "3005");
  const b = parse(env.G2_QA_OTHER_ORIGIN, "3006");
  if (a.hostname !== b.hostname || env.P8_QA_ALLOWED_ORIGIN !== a.origin)
    throw new Error("G2 both Next hosts must use the same hostname and exact allowed origin A");
  return { a: a.origin, b: b.origin };
}
