# Verification and limitations

## Qualified scope

The pinned reveal.js 6.0.2 two-slide index deck is exercised through its real browser distribution, not a replacement mock host. The assistant uses the actual AE runtime and tool broker. Its deterministic caller is explicitly simulated; these results do not measure model quality or paid-provider reliability.

| Check | Observed result |
|---|---|
| Original upstream identity | Exact commit `75dff6f515d2d08df0c32cf2b7328b89425c6f25`; MIT license retained |
| Original TypeScript check | `tsc --noEmit` passed |
| Original upstream QUnit suite | 17 pages, 143 tests; 411 assertions passed, 4 failed in 2 CDN-dependent MathJax4 rendering tests |
| Final upstream parity | Same 17 pages and identical per-page assertion pass/fail counts; final `tsc --noEmit` passed |
| Original browser baseline | Rendering, next/previous keyboard navigation, overview open/close captured before adaptation |
| AE lifecycle | Source assessment, source-bound plan, delegated engineering approval, immutable pre-apply baseline, isolated apply, verification, delivery and delivery-check passed |
| Narrow lifecycle differential | Original/adapted navigation and overview observations match before any authored edit |
| Governed host tests | Exact approval, foreign/revoked authority, schema validation, stale targets, repeated operations, cancellation, lost response, receipt reconciliation and fresh-host SQLite persistence passed |
| Browser flows | Inspect, exact before/after preview, confirm, reload persistence, reject/cancel, repeated/stale confirmation, real interrupted HTTP response recovery, foreign Origin denial, drag/keyboard/mobile/Escape/focus passed |
| Standalone repository regression suite | 7/7 Node tests passed, including the shared AE agent loop pausing for confirmation |

The MathJax4 failures are an external dependency limitation: `https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js` returned `net::ERR_EMPTY_RESPONSE` in the verification environment. They were observed on the untouched original, not suppressed or converted to passes. The local authoring deck does not load MathJax.

The lifecycle profile's `host-syntax-check` is explicitly Node syntax checking, not a claim of a complete upstream TypeScript build. The original TypeScript and complete QUnit observations are independent checks. The narrow lifecycle profile does not certify every reveal.js feature or arbitrary presentation source.

Screenshots: [original host](assets/before.png), [inline approval](assets/approval.png), [confirmed edit](assets/after.png), [mobile panel](assets/mobile.png).

## Reproduce the integration tests

```bash
AE_ROOT=/absolute/path/to/agentic-everything node --test scripts/agentic.test.mjs
```

Tests use temporary SQLite files and the built AE runtime. They do not change the original deck, call a paid model or contact an external service.

For upstream development checks, install the original exact lockfile using `npm ci --ignore-scripts`, then follow `README.upstream.md`. The original upstream `npm test` command runs QUnit through Puppeteer; a resource-constrained verifier may run those same unmodified pages sequentially. Browser executable installation and external MathJax connectivity are separate prerequisites.

## Not claimed

- Production identity, multi-user/tenant isolation, remote hosting, TLS or deployment.
- Arbitrary deck editing, generated HTML/JavaScript, external-file mutation or generic framework discovery.
- Durable AE run/approval recovery after server restart. Only the host overlay and operation receipts are durable.
- Real-provider inference quality, latency, cost or reliability.
- A tamper-proof/signed execution attestation: lifecycle bundles are source/hash-bound, semantically checked local evidence.
