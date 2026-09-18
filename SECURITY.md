# Security Policy 🔒

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

---

## Architectural Security Model

Jev Shield adheres to a strict **Bring-Your-Own-Key (BYOK)** and **Zero-Telemetry** architecture:
- User API keys are stored exclusively on the client machine in `chrome.storage.local`.
- API keys are transmitted directly to the TypeSafe endpoint (`https://api.typesafe.ai`) over TLS.
- No intermediary proxy, analytics server, telemetry collector, or tracking server is used.
- Candidate text snippets are kept transient in memory or cached by 32-bit hashes in `chrome.storage.session`.

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential privacy leak in Jev Shield:
1. Please do **NOT** open a public issue.
2. Instead, report it privately via GitHub Security Advisories or contact the repository owner directly.
3. We will acknowledge receipt within 48 hours and work with you to release a fix.
