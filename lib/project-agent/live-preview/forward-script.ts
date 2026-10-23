/** Runs inside the sandbox: reads one request as JSON on stdin, calls 127.0.0.1:<port>, writes a JSON header line then the raw body. */
export const LIVE_FORWARD_SCRIPT = String.raw`
import base64, http.client, json, sys
req = json.loads(sys.stdin.buffer.read())
out = sys.stdout.buffer
def reply(status, headers, body=b""):
    out.write((json.dumps({"status": status, "headers": headers}) + "\n").encode()); out.write(body); out.flush()
try:
    port = int(req["port"])
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=25)
    skip = {"host", "connection", "content-length", "accept-encoding", "cookie", "authorization", "upgrade"}
    headers = {k: v for k, v in req["headers"].items() if k.lower() not in skip}
    headers["Host"] = "127.0.0.1:%d" % port
    headers["Accept-Encoding"] = "identity"
    body = base64.b64decode(req["body"]) if req.get("body") else None
    conn.request(req["method"], req["path"], body=body, headers=headers)
    res = conn.getresponse()
except Exception as error:
    reply(502, [["content-type", "text/plain; charset=utf-8"]], ("Nothing answers on port %s in the sandbox (%s). Ask the agent to start the server again." % (req.get("port"), error)).encode()); sys.exit(0)
drop = {"transfer-encoding", "connection", "keep-alive", "set-cookie", "content-length"}
reply(res.status, [[k, v] for k, v in res.getheaders() if k.lower() not in drop])
while True:
    chunk = res.read(65536)
    if not chunk: break
    out.write(chunk); out.flush()
`;
