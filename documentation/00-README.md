# Secure Enterprise Communications Platform — Documentation Set

This package contains the full engineering documentation set for the project, generated from the initial platform concept discussion and the confirmed tech stack (React/TS/Vite frontend, Hono on Cloudflare Workers backend, D1/R2/KV/Durable Objects/Queues, RBAC + E2EE).

| # | Document | What it answers |
|---|---|---|
| 1 | [Project Specification / PRD](01-project-specification-prd.md) | What exactly am I building? |
| 2 | [SRS](02-srs-software-requirements-specification.md) | What must the software do? |
| 3 | [System Architecture / HLD](03-system-architecture-hld.md) | What are the major components and how do they interact? |
| 4 | [LLD / TDS](04-lld-tds-low-level-design.md) | How exactly will each component work? |
| 5 | [Database Design](05-database-design.md) | How is data structured and stored? |
| 6 | [API Specification](06-api-specification.md) | How do components communicate? |
| 7 | [Security Design](07-security-design.md) | How is the system protected? |
| 8 | [Infrastructure Design](08-infrastructure-design.md) | Where/how does everything run? |
| 9 | [Testing Strategy](09-testing-strategy.md) | How will I verify the system? |
| 10 | [Deployment / CI-CD Specification](10-deployment-cicd-specification.md) | How does code get from my machine to production? |
| 11 | [Observability & Operations](11-observability-operations.md) | How do I monitor/debug it? |
| 12 | [ADRs](12-adrs-architecture-decision-records.md) | Why did I make important technical decisions? |

## Reading order

- New to the project → start with **1 (PRD)** then **2 (SRS)**.
- Building the backend → **3 (HLD)** → **4 (LLD)** → **5 (Database)** → **6 (API)**.
- Security review → **7 (Security Design)** first, then **12 (ADRs)** for rationale.
- Setting up environments/pipelines → **8 (Infrastructure)** → **10 (CI/CD)** → **11 (Observability)**.
- QA → **9 (Testing Strategy)**.

## Cross-cutting principles referenced throughout

1. **Ciphertext-only server** — no plaintext message/file content ever touches the backend.
2. **Organization isolation everywhere** — enforced at API, database, authorization, and storage/encryption layers, not just the UI.
3. **No custom cryptography** — established primitives and protocols only.
4. **No hard user deletes** — status-driven lifecycle preserves audit/history integrity.
5. **No public "zero-knowledge"/full-E2EE claims** until independent security review and penetration testing are complete (see Security Design §13, ADR-011).
