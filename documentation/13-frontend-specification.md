# Frontend Specification

## 1. Purpose

Defines the frontend's visual identity, interaction model, component conventions, and motion language for the secure communications platform. This is the sibling document to the System Architecture/HLD and API Specification — those define what the frontend talks to; this defines what the frontend **is**.

This is not a dashboard-with-a-sidebar SaaS template. The design direction is a **secure terminal / operator console** — the visual language of the tools this product's own users (security teams, IT admins, engineers) already trust: monospace type, a command palette instead of nested menus, a persistent status line, and visible, honest system state (connection, encryption, latency) at all times. The aesthetic is a direct expression of the product's core promise — nothing hidden, nothing decorative pretending to be secure.

---

## 2. Design Thesis

> **"The interface should look like it could show you the encryption, if you asked it to."**

Every consumer chat app hides its machinery behind soft bubbles and friendly color. This product does the opposite: it makes the *fact* of security legible — not by exposing cryptographic detail to end users (see Security Design §12, plaintext never leaves the device either way), but by borrowing the visual grammar of terminals, logs, and operator consoles, where state is always visible and nothing is ambiguous. The result should feel closer to a well-designed CLI tool, a flight instrument panel, or a Bloomberg terminal than to a consumer messaging app — precise, dense where it earns density, calm everywhere else.

**Signature element:** the **Handshake Sequence** — a short, real terminal-style boot log (`establishing session… x25519 key agreement… session verified ✓`) that plays the first time a conversation, group, or channel is opened in a session. It is the one moment of real "performance" in the UI: everywhere else, motion is quiet and functional. This single ritual carries the entire security narrative without a single padlock icon.

---

## 3. Design Tokens

### 3.1 Color

Named, not generic. Dark-mode-native (there is no light theme in v1 — a terminal does not apologize for being dark). Avoid the generic "near-black + acid-green" AI-cliché: this palette leans blue-black with a **spring-teal** signal color (not neon green) and a warm amber for attention states, giving it a cooler, more deliberate, more "instrument panel" feel than a hacker-movie green-on-black look.

| Token | Hex | Use |
|---|---|---|
| `--bg-void` | `#0A0D0E` | App background — near-black with a faint blue-green cast |
| `--bg-surface` | `#10161A` | Panels: sidebar, message log, inspector |
| `--bg-raised` | `#161E22` | Cards, popovers, command palette, modals |
| `--border-hairline` | `#212B2E` | 1px structural dividers, pane borders |
| `--border-focus` | `#2B383C` | Hover/active pane borders |
| `--text-primary` | `#DCE6E3` | Body text — soft phosphor white, not pure white |
| `--text-secondary` | `#7C8E8A` | Timestamps, metadata, labels |
| `--text-dim` | `#4A5B58` | Disabled, placeholder, comments-style text |
| `--signal-cipher` | `#2EE6A8` | Primary accent — encrypted/verified/online state ("cipher teal") |
| `--signal-amber` | `#F0B849` | Pending, warnings, unverified device |
| `--signal-violet` | `#B695F5` | Secondary accent — mentions, admin actions, the Handshake Sequence glow |
| `--signal-red` | `#F0575A` | Errors, revoked, destructive actions |
| `--signal-cipher-dim` | `#2EE6A8` at 12% opacity | Ambient glows, encrypted-badge backgrounds |

Color is used **as signal, not decoration**. `--signal-cipher` appears only where something is genuinely verified/live/encrypted; it is never used as a generic "brand color" splashed on buttons that don't carry that meaning. Everyday UI (buttons, links, nav) stays in the neutral text/border scale, so when a cipher-teal glow appears, it means something.

### 3.2 Typography

**Single-family system: [JetBrains Mono](https://www.jetbrains.com/lp/mono/), used across every role** — display, body, UI chrome, and data. This is a deliberate constraint, not a shortcut: a monospace-only system is what makes the terminal metaphor real rather than cosmetic (a "terminal-themed" UI set in a humanist sans would be a costume, not an identity). Distinction between roles comes from **weight, size, and color**, not a second typeface.

| Role | Weight | Size / Line-height | Letter-spacing | Example use |
|---|---|---|---|---|
| Display / hero | JetBrains Mono ExtraBold | 40–64px / 1.05 | −0.01em | Marketing/landing hero, empty-state headlines |
| Section heading | JetBrains Mono Bold | 20–24px / 1.2 | 0 | Panel titles, modal titles |
| UI label | JetBrains Mono Medium | 13px / 1.4, uppercase, tracked | +0.08em | Nav items, field labels, status bar segments |
| Body / message text | JetBrains Mono Regular | 14–15px / 1.6 | 0 | Message content, descriptions |
| Data / metadata | JetBrains Mono Regular | 12px / 1.4 | 0 | Timestamps, IDs, audit rows, code-like values |
| Prompt accent | JetBrains Mono Bold, `--signal-cipher` | matches context | 0 | `>` prompt glyphs, inline status markers |

Numerals use **tabular figures** (JetBrains Mono's default) throughout so timestamps, counters, and the status bar never jitter.

### 3.3 Layout Concept

Not sidebar-plus-cards. The shell is modeled on a **code editor / IDE**, because that is the honest structure of what the product actually is (a tree of orgs → channels/groups/conversations, a main buffer, contextual inspector, and persistent status):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⌘K palette (overlay, not shown at rest)                                  │
├───────────────┬───────────────────────────────────────┬─────────────────┤
│  DIRECTORY     │  BUFFER (active conversation)          │  INSPECTOR      │
│                │                                         │                │
│  ▾ ACME CORP   │  #engineering                    ▣ ▤ ✕  │  MEMBERS (12)  │
│    ▾ Channels  │  ──────────────────────────────────────│  ● alice   ✓   │
│      # general │  [09:14] alice.k                        │  ● bob     ✓   │
│      # eng     │  > Deploy completed, all green.         │  ○ charlie ⏳  │
│    ▾ Groups    │                                          │                │
│      Eng Lead  │  [09:15] bob.r                          │  ENCRYPTION    │
│    ▾ Direct    │  > nice, watching metrics now           │  cipher: AES-  │
│      sarah.w   │  ▏ (typing…)                            │  256-GCM       │
│                │                                          │  epoch: 4      │
│                │  ┌────────────────────────────────────┐ │                │
│                │  │ > type a message                    │ │  SECURITY      │
│                │  └────────────────────────────────────┘ │  ✓ verified    │
├───────────────┴───────────────────────────────────────┴─────────────────┤
│ ● connected   ⌁ acme-corp   🔒 e2ee active   12ms   usr_72a91f   09:15:44 │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Directory pane** (left, ~260px, collapsible): file-tree-style navigation of channels/groups/direct messages, grouped and disclosure-triangled like a project explorer — not flat chat list icons.
- **Buffer** (center, flexible): the active conversation, rendered as a scrolling log, not stacked bubbles (see §5.2).
- **Inspector** (right, ~300px, collapsible): contextual panel — members, encryption/key epoch info, security verification state, file attachments in the conversation. This is where "the system could show you the encryption if you asked" becomes literal, in plain non-cryptographer language.
- **Status bar** (bottom, full-width, 28px, always visible): connection state, active organization, E2EE indicator, live latency reading, current user ID, clock. Directly modeled on VS Code / vim status lines. This single bar does more to sell "secure operator tool" than any badge or icon elsewhere in the product.
- **Command palette** (`⌘K` / `Ctrl+K`): the primary navigation method for power users — jump to any conversation, run an admin action, switch org — overlaying everything else, fuzzy-searchable, keyboard-first.

This structure is genuinely functional, not decorative: it maps directly onto the platform's real information architecture (organization → channels/groups/conversations → messages/members/security), so density here is earned, not imposed.

### 3.4 Iconography

Prefer **glyph and symbol characters over illustrated icon sets** where it reinforces the terminal register: `●`/`○` for presence, `▾`/`▸` for tree disclosure, `✓`/`⏳`/`✕` for status, `⌁` for org/network, `🔒` reserved *only* for the single global E2EE status indicator (not sprinkled per-message — see §5.2 on avoiding "encryption theater"). Where a true icon is needed (attach, send, emoji), use **Lucide** (already available in the stack) at 16–18px, 1.5px stroke, recolored to the neutral text scale — icons are utility, not brand.

### 3.5 Radius, Elevation, Borders

- **Border radius: 3px** everywhere (inputs, buttons, panels, modals). Not 0 (too brutalist/newspaper for a product with real interactivity), not 12–16px (reads as generic consumer-SaaS-soft). 3px is enough to feel intentional without softening the terminal register.
- **No drop shadows for elevation.** Elevation is communicated with a 1px `--border-focus` hairline and a subtly lighter `--bg-raised` background — shadows read as "app," hairlines read as "console."
- **Focus states** use a 2px `--signal-cipher` outline offset 2px — always visible, never suppressed, per accessibility floor (§8).

---

## 4. Motion Language

Motion is **functional first, atmospheric second**, and used sparingly enough that its one big moment (the Handshake Sequence) actually lands.

| Moment | Behavior |
|---|---|
| **Handshake Sequence** (signature element) | On first opening a conversation/group/channel per session: a 900ms terminal-log sequence types out 3–4 lines (`establishing session…`, `x25519 key agreement…`, `session verified ✓`) in `--signal-cipher`, monospace, with a blinking block cursor, then the log dissolves upward as the real message buffer fades in beneath it. Never replayed again for that conversation in the same session — it's a ritual, not a loading spinner. |
| App load | Status bar segments illuminate left-to-right in ~150ms steps (`connecting… → connected → syncing → ready`), echoing a real boot sequence rather than a generic spinner. |
| New message arrival | Log line appears with a 120ms opacity+2px-translateY ease; no bounce, no scale — this is a log, not a bubble popping in. |
| Typing indicator | A blinking block cursor (`▏`) after the sender's name, not three animated dots — consistent with the log metaphor. |
| Key rotation / member removed | A single amber log line is inserted inline in the buffer itself (`[09:20] system > encryption key rotated (member removed)`), not a toast — security-relevant events are part of the record, not ephemeral chrome. |
| Command palette open/close | 120ms scale (0.98→1) + opacity, centered — fast enough to feel instant at keyboard speed. |
| Hover on interactive rows | Background shifts to `--bg-raised`, no movement — density-appropriate restraint. |
| Reduced motion | All of the above collapse to instant state changes (opacity swap only) when `prefers-reduced-motion` is set; the Handshake Sequence becomes a single static "session verified ✓" line, no typing animation. |

---

## 5. Component Conventions

### 5.1 Directory Pane
- Tree items use disclosure triangles (`▾`/`▸`), not chevron icons, consistent with §3.4.
- Unread counts render as a plain `[3]` in `--signal-cipher`, right-aligned — not a rounded red badge (badges are the consumer-app default this product is deliberately avoiding).
- Active item: `--bg-raised` background + 2px left border in `--signal-cipher`, no rounded pill highlight.

### 5.2 Message Buffer ("the log")
- Messages render as **log lines**, not chat bubbles: `[HH:MM:SS] sender.handle` on one line, message content on the next, left-aligned, full-width, divided by whitespace rather than boxes. This is the biggest single departure from consumer-chat convention and the clearest expression of the terminal thesis.
- Consecutive messages from the same sender within 2 minutes collapse under one timestamp/name header (like grouped log output), avoiding visual noise.
- **Deliberately no per-message padlock/encryption icon.** Encryption is a property of the whole system (communicated once, persistently, in the status bar), not a sticker earned per message — repeating it per-bubble is "encryption theater" and this product does not need to perform security it actually has.
- File attachments render as a terminal-style file card: `▤ quarterly-report.pdf  2.1MB  ↓ download` in a bordered `--bg-raised` block — utilitarian, not a thumbnail-heavy preview tile.
- Reactions render as inline plain-text tokens (`:+1: 3`) with a subtle `--bg-raised` pill on hover-only, not permanent colorful emoji chips — keeps the log readable at rest.

### 5.3 Composer (message input)
- A single-line-growing textarea prefixed with a static `>` prompt glyph in `--text-dim` (activates to `--signal-cipher` on focus) — directly extending the terminal metaphor to the one place users type.
- Send affordance is `Enter`-to-send / `Shift+Enter`-for-newline (power-user default), with a minimal send icon-button as the visible fallback.

### 5.4 Command Palette
- Modeled directly on VS Code's / Linear's / Raycast's command palettes: centered overlay, fuzzy search, grouped results (Conversations, Actions, Admin, Navigate), keyboard-only operable end-to-end.
- This is the **primary** navigation surface for anything beyond the immediately visible directory tree — reinforces the "operator console" register over "click through menus."

### 5.5 Status Bar
- Fixed 28px, always visible, never collapses on scroll. Segments, left to right: connection dot (`●` cipher-teal / `●` amber reconnecting / `●` red disconnected), org name, global E2EE indicator (`🔒 e2ee active`), live latency in ms (updates every few seconds, not decorative — real telemetry per Observability doc §4), current user ID, clock.
- This bar is the single home for the "is this actually secure and working right now" question — answered honestly and continuously, never hidden behind a settings page.

### 5.6 Admin Surfaces (Security Center, member management, audit log)
- Same visual system, denser: tables use monospace-aligned columns (IDs, timestamps, statuses in fixed-width columns — this is where monospace pays for itself functionally, not just aesthetically).
- Security Center metrics (MFA adoption %, verified devices %, active sessions — per Security Design §11 / Observability §10) render as **terminal-style horizontal bar meters** built from block characters (`████████░░` style, implemented as styled divs, not literal characters) in `--signal-cipher`, not consumer-dashboard donut charts — consistent, legible, on-theme.
- Audit log renders exactly like the message buffer's log-line convention (`[timestamp] actor > event_type`), reinforcing that audit events and messages share one visual grammar: this system logs everything it's allowed to log, in the open.

### 5.7 Empty & Error States
- Empty states get a short, single-line prompt-style message, not an illustration: `> no conversations yet — press ⌘K to start one`.
- Errors render as an inline log-style line in `--signal-red`: `> failed to send — retry`, with a retry action, never a generic modal alert for recoverable errors. Destructive/blocking errors (auth failure, org mismatch) do use a modal, styled with the same `--bg-raised` + hairline system as every other panel.

---

## 6. Responsive Behavior

- **Desktop (≥1024px):** full three-pane layout as in §3.3.
- **Tablet (768–1023px):** inspector pane collapses to a slide-over triggered by a status-bar affordance; directory + buffer remain side-by-side.
- **Mobile (<768px):** single-pane, stack-navigated (directory → buffer → inspector as full-screen views with back navigation), status bar compresses to connection dot + E2EE indicator + clock only. Command palette becomes a full-screen search view rather than a centered overlay. The Handshake Sequence still plays, compressed to ~2 lines to respect smaller viewport attention span.

---

## 7. Implementation Notes (React + Tailwind + shadcn/ui)

- **Font loading:** self-host JetBrains Mono variable font (avoid FOUC/layout shift on an already-monospace-sensitive layout); set as the single `font-mono`/`font-sans` value in `tailwind.config` so no other family can leak in accidentally.
- **Design tokens as CSS variables:** all colors in §3.1 defined as CSS custom properties on `:root`, consumed via Tailwind's `theme.extend.colors` referencing `var(--token-name)` — keeps the token system the single source of truth rather than hardcoded hex scattered through components, and makes a future theme (e.g., a "high-contrast" security tier variant) a variable swap, not a rewrite.
- **shadcn/ui components** (Dialog, Popover, Command, Dropdown) are used for their accessibility/behavior primitives (focus trapping, keyboard nav) but **fully re-skinned** to the tokens above — none should be visually recognizable as "default shadcn" (no default radius, default shadow, or default font). The `Command` component in particular is the base for the `⌘K` palette (§5.4).
- **State (Zustand):** UI-only state (pane collapse, active buffer, palette open/closed, reduced-motion override) lives in a dedicated `uiStore`, separate from domain data stores (conversations, messages, org/session) so visual-shell state never entangles with the E2EE data layer.
- **Status bar telemetry:** latency and connection-state segments subscribe to the same realtime layer described in System Architecture §4.5/§6 (WebSocket + Durable Object heartbeats) — this bar must reflect real state, never a mocked or purely cosmetic value.

---

## 8. Accessibility Floor (non-negotiable, per house standard)

- Full functionality operable via keyboard alone, including the command palette, directory tree, and composer.
- Visible focus states on every interactive element (2px `--signal-cipher` outline, §3.5) — never suppressed via `outline: none` without a replacement.
- Color is never the sole carrier of meaning: status dots pair with text/labels (e.g., "connected," not just a colored dot) for colorblind users.
- Minimum contrast: body text (`--text-primary` on `--bg-void`/`--bg-surface`) exceeds WCAG AA for normal text; `--text-secondary` meets AA for large/UI-label text only, and is never used for body copy.
- `prefers-reduced-motion` respected throughout (§4).
- Responsive down to 360px width without horizontal scroll or clipped content (§6).

---

## 9. What This Explicitly Avoids

To keep the direction disciplined and prevent drift back toward generic patterns during implementation:

- No rounded chat bubbles, no avatar-heavy consumer-messenger layout.
- No colorful gradient hero sections or soft-cream/terracotta palette (the current AI-generated-design default) — this product's palette is cool, dark, and signal-driven.
- No donut charts or illustrated empty-state graphics on admin surfaces — bar meters and log-style text only, consistent with the console metaphor.
- No per-message encryption badges/lock icons ("encryption theater") — the security narrative lives in the status bar and the Handshake Sequence, stated once and trusted, not repeated for reassurance.
- No drop-shadow-heavy card elevation — hairline borders and background-tone shifts only.
- No second typeface smuggled in "just for headings" — the monospace-only constraint is the identity.