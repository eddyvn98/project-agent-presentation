# Local Browser MCP for ChatGPT

A dependency-free Node.js 22+ MCP HTTP server that controls a **separate, debug-enabled** Chrome profile. Default browser allowlist: `http://localhost:3002` and `http://127.0.0.1:3002`.

## 1. Open a dedicated Chrome on macOS

Start the local web app on port 3002 first. In macOS Terminal:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/.project-agent-mcp-chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9223 \
  --new-window "http://localhost:3002/account/agent-skills"
```

Chrome 136+ requires a **non-default** user data directory for remote debugging. Never enable debugging on your everyday Chrome profile. Sign in in this new, separate window if required. Verify:

```bash
curl -s http://127.0.0.1:9223/json/version
```

If it fails, Chrome did not launch with the debug port. Existing everyday Chrome tabs are **not** controllable by this server.

## 2. Install and run MCP

```bash
git clone https://github.com/eddyvn98/project-agent-presentation.git
cd project-agent-presentation
git switch gpt/local-browser-mcp
cd tools/browser-mcp
node --version   # must be 22+
npm test
npm start
```

The endpoint is `http://127.0.0.1:3333/mcp`. Verify in another Terminal:

```bash
curl http://127.0.0.1:3333/healthz
curl -s http://127.0.0.1:3333/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Optional origin configuration:

```bash
BROWSER_MCP_ALLOWED_ORIGINS='http://localhost:3002,http://127.0.0.1:3002,http://127.0.0.1:4183' npm start
```

Set `BROWSER_MCP_TOKEN` only when your MCP client can forward an Authorization bearer header, otherwise leave it unset. Never expose this unprotected local server to a public IP.

## 3. Securely connect private localhost to ChatGPT

ChatGPT's cloud cannot directly connect to `127.0.0.1` on your Mac. Use the official **Secure MCP Tunnel**:

1. Go to [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels). Create a tunnel and associate it with your ChatGPT workspace. Platform tunnel roles and ChatGPT plugin creation permissions are required.
2. Install the latest `tunnel-client` from [openai/tunnel-client releases](https://github.com/openai/tunnel-client/releases).
3. Use `tunnel-client help quickstart` to check the current CLI. For a named HTTP MCP profile:

```bash
# Enter the API key locally; never share it in chat or commit it.
read -rs CONTROL_PLANE_API_KEY
export CONTROL_PLANE_API_KEY

tunnel-client init --sample sample_mcp_stdio_local \
  --profile local-browser --tunnel-id tunnel_YOUR_ID \
  --mcp-server-url http://127.0.0.1:3333/mcp

tunnel-client doctor --profile local-browser --explain
tunnel-client run --profile local-browser
```

If your installed CLI rejects the sample name, follow `tunnel-client help samples` to choose the current HTTP MCP sample. More: [official tunnel documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

4. In ChatGPT web: **Plugins → + → Add custom MCP server → Tunnel**. Select the tunnel ID; review and confirm permissions. Business workspace admins/owners may be required. See [custom MCP instructions](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
5. Enable the newly created plugin in a new chat. Start read-only: `Use Local Browser MCP to call browser_status, browser_tabs, and browser_snapshot on localhost:3002. Do not click yet.`

Chrome, the local MCP service, and `tunnel-client` must keep running during use.

## Browser tools

`browser_status`, `browser_tabs`, `browser_open`, `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill`, `browser_press`, `browser_screenshot`.

Click and fill require unique CSS selectors; ambiguous selectors are rejected. Password inputs are blocked. There is deliberately no arbitrary JavaScript tool. User approval is advisable for any write action. A clicked link can still leave the approved site briefly, so use a dedicated profile with no unrelated accounts.

## Testing and limitations

`npm test` runs protocol and allowlist tests. Set `CHROME_BIN=/path/to/chrome` to enable Chromium CDP interaction tests. Validated in an isolated Chromium test environment; the managed test browser blocked localhost navigation, so live interaction with your personal `localhost:3002` and end-to-end Secure MCP Tunnel registration remain **unverified**.

This MCP enables browser interaction through a custom plugin **only if your ChatGPT workspace allows the plugin and its tools**. It does not modify the permissions of the built-in read-only Browser connector.
