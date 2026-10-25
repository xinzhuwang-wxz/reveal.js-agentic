# Architecture

## Source and ownership

Upstream: `hakimel/reveal.js`, release **6.0.2**, commit `75dff6f515d2d08df0c32cf2b7328b89425c6f25`, MIT. Original business source and distributed presentation assets are unchanged.

Agentic Everything core: accepted runtime `942493175df0e183bc1e1d990db1a359671da50a`, documentation release `1c13ee92c42536f4035adb392820fb4fde7bdc6a`, with the separately reviewed pinned reveal adaptation recipe/profile qualified at AE commit `001826fa417cbe042d8094e7731cc8e9d1dc332b`. The runtime is resolved from the explicit `AE_ROOT` checkout.

## Components

- `agentic/assistant.mjs`: accessible floating launcher/panel; original Reveal API navigation; render authored plain text with `textContent`; inline approval and configuration/boundaries view.
- `agentic/server.mjs`: loopback-only host HTTP composition, local session/Origin boundary, deterministic simulated model caller, shared AE `GovernedRuntime` and `ToolBroker`.
- `agentic/host.mjs`: strict two-capability catalog, current local authority, optimistic deck version, SQLite atomic deck/receipt transaction and receipt lookup.
- `agentic/ae.mjs`: imports the existing built AE runtime, policy, capabilities and Zod packages. No parallel approval engine or agent loop is implemented here.

The server injects the UI module while serving the original index; it does not patch `index.html`. SQLite stores a local authored overlay rather than modifying the upstream source file. Other decks are read-only and not implicitly opted into this scope.

## Governance

`read_deck` accepts only `{ deckId: "index" }`. `replace_slide_text` accepts that ID, slide index 0 or 1, bounded plain text and the expected numeric deck version. Extra fields, other decks, scripts-as-HTML and arbitrary path arguments are not supported.

The local owner is server-composed, never accepted from request JSON. Source text, the model caller, browser context and tool results cannot grant permission. A durable edit requires both the server's explicit `--allow-write` opt-in and an AE approval bound to the caller, capability, arguments, target version, operation, release, policy and expiry. Authority and version are checked again when the host executes.

A successful mutation and its receipt commit in one SQLite transaction. A repeated matching operation returns the same receipt; conflicting operation content fails. Lost responses are not automatically retried. The host can look up an existing durable receipt after restart, but this composition's AE runs and approvals are in memory. The UI does not claim to restore a vanished pending approval.

## Security and scope

Loopback-only single operator, exact Host and write Origin, HttpOnly SameSite session cookie, strict request shapes, bounded request bodies and no paid/external model traffic. This does not provide multi-user authentication, CSRF protection for a remotely deployed service, TLS, database backup policy, distributed orchestration or production hardening.

The exact pinned upstream verification profile executes the original distributed browser code, fixed generated modules and fixed tests. It is not permission to execute arbitrary source or install dependencies. Full upstream QUnit and type checks are reported separately from the narrow AE lifecycle profile.
