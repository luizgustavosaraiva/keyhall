import { Agent, setGlobalDispatcher } from "undici"

// Outbound requests (fetch, MCP clients) over HTTP/1.1. Node 26's bundled undici negotiates
// HTTP/2, and closing an MCP session while its background GET is still open later fails the
// idle HTTP/2 stream with an unhandled error that takes the process down. Node 24 already
// behaves like this.
setGlobalDispatcher(new Agent({ allowH2: false }))
