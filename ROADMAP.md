# Mix Studio roadmap

This file tracks deferred work that is useful but not ready to prioritize over generation reliability and the core creation experience.

## Deferred integrations

### Gemini Spark remote control

**Status:** Deferred while Gemini Spark's custom MCP support remains in beta.

What we established during the first integration pass:

- Mix Studio exposes a narrow, secret-path MCP endpoint through Tailscale Funnel without publishing the web app itself.
- The endpoint successfully handles Streamable HTTP initialization, tool discovery, and tool calls.
- Browser-origin requests from `https://gemini.google.com` receive the required CORS response.
- Gemini Spark still rejects the custom URL before establishing an MCP session, despite those protocol and browser checks succeeding.

Re-evaluate this integration after Gemini Spark's validator requirements or beta documentation change. At that point:

1. Test the endpoint on default HTTPS port 443 to determine whether Spark rejects nonstandard port 8443.
2. Confirm whether Spark requires OAuth, dynamic client registration, or another authentication handshake instead of a secret URL.
3. Re-run initialization, discovery, invocation, and browser-origin checks against Spark's current requirements.
4. Preserve the current security boundary: expose only the MCP endpoint and its limited tool set, not the Mix Studio web interface.
