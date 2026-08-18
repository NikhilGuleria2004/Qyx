import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@qyx/ui';

/* ----------------------------------------------------------------------- */
/* Data                                                                      */
/* ----------------------------------------------------------------------- */

const BOOT_LINES = [
  { text: 'resolving organization boundary', status: 'OK' },
  { text: 'verifying identity provider', status: 'OK' },
  { text: 'establishing isolation layer', status: 'OK' },
  { text: 'attaching audit stream', status: 'OK' },
  { text: 'session ready', status: null },
];

const FEATURES = [
  {
    pid: '01',
    label: 'identity',
    status: 'VERIFIED',
    text: 'Verified organizational identity per user. No anonymous access, no guest accounts.',
  },
  {
    pid: '02',
    label: 'access-control',
    status: 'ENFORCED',
    text: 'Role-based permissions — Super Admin, Admin, Manager, Employee. Least-privilege by default.',
  },
  {
    pid: '03',
    label: 'isolation',
    status: 'ISOLATED',
    text: 'Organization boundaries enforced at the API, database, authorization, and storage layers.',
  },
  {
    pid: '04',
    label: 'audit',
    status: 'LOGGED',
    text: 'Comprehensive event logging for security and compliance. Admin visibility without message exposure.',
  },
  {
    pid: '05',
    label: 'devices',
    status: 'MANAGED',
    text: 'Device registration, approval workflows, and remote revocation. Session lifecycle handled end-to-end.',
  },
  {
    pid: '06',
    label: 'files',
    status: 'POLICED',
    text: 'Org-configurable file policies — type allow-list, size limits, external sharing. Encrypted in transit.',
  },
];

const LAYERS = ['API', 'AUTHZ', 'DATABASE', 'STORAGE'];

/* ----------------------------------------------------------------------- */
/* Small pieces                                                             */
/* ----------------------------------------------------------------------- */

function Cursor() {
  return (
    <span
      aria-hidden
      className="inline-block h-[1em] w-[0.5em] translate-y-[0.1em] bg-signal-cipher motion-safe:animate-[blink_1s_steps(1)_infinite] motion-reduce:opacity-100"
    />
  );
}

function StatusTag({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] tracking-wider text-signal-cipher">
      [{children}]
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/* Hero boot sequence                                                       */
/* ----------------------------------------------------------------------- */

function BootSequence() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [done, setDone] = useState(false);
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (reduceMotion.current) {
      setVisibleLines(BOOT_LINES.length);
      setDone(true);
      return;
    }
    if (visibleLines >= BOOT_LINES.length) {
      const t = setTimeout(() => setDone(true), 300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleLines((n) => n + 1), 260);
    return () => clearTimeout(t);
  }, [visibleLines]);

  return (
    <div
      className="rounded-sm border border-hairline bg-[#0D1215]/80 px-5 py-4 font-mono text-[13px] leading-relaxed shadow-[0_0_40px_-20px_rgba(79,231,201,0.4)]"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center gap-2 border-b border-hairline pb-2 text-text-dim">
        <span className="h-2 w-2 rounded-full bg-signal-cipher/70" />
        qyx — session bootstrap
      </div>
      {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
        <div key={line.text} className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">
            <span className="select-none text-text-dim">{'>'} </span>
            {line.text}
            {i === visibleLines - 1 && !done && <Cursor />}
          </span>
          {line.status && <StatusTag>{line.status}</StatusTag>}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Isolation boundary diagram                                               */
/* ----------------------------------------------------------------------- */

function IsolationDiagram() {
  return (
    <div className="rounded-sm border border-dashed border-signal-cipher/40 p-6">
      <div className="mb-4 flex items-center justify-between font-mono text-[11px] tracking-widest text-signal-cipher">
        <span>┌─ ORG BOUNDARY ──────────────────────</span>
        <span>ENFORCED</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LAYERS.map((layer) => (
          <div
            key={layer}
            className="rounded-sm border border-hairline bg-[#10161A] px-3 py-4 text-center"
          >
            <div className="font-mono text-xs tracking-wider text-text-primary">
              {layer}
            </div>
            <div className="mt-1 font-mono text-[10px] text-text-dim">isolated</div>
          </div>
        ))}
      </div>
      <div className="mt-4 font-mono text-[11px] tracking-widest text-signal-cipher">
        └──────────────────────────────────────
      </div>
      <p className="mt-4 text-sm text-text-secondary">
        Every request is scoped to a single organization before it reaches a
        query, a permission check, or a stored file. No shared tenancy, no
        cross-org lookups, no exceptions for internal tooling.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                      */
/* ----------------------------------------------------------------------- */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0D0F] text-text-primary">
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>

      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-hairline bg-[#0A0D0F]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="font-mono text-sm tracking-widest text-text-primary">
            qyx<span className="text-signal-cipher">_</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="font-mono text-xs">
                sign in
              </Button>
            </Link>
            <Link to="/register">
              <Button className="font-mono text-xs">get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* Hero */}
        <section className="grid gap-10 py-20 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="space-y-6">
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-text-dim">
              {'>'} organization-centric messaging
            </div>
            <h1 className="font-mono text-5xl font-bold tracking-tight text-text-primary sm:text-6xl">
              qyx
            </h1>
            <p className="max-w-md text-lg text-text-secondary">
              Private messaging, group collaboration, and controlled broadcast —
              built for organizations that can't afford a boundary mistake.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <Link to="/register">
                <Button className="font-mono">$ qyx init --org</Button>
              </Link>
              <Link to="/login">
                <Button variant="ghost" className="font-mono">
                  sign in
                </Button>
              </Link>
            </div>
          </div>
          <BootSequence />
        </section>

        {/* Trust strip */}
        <section className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-hairline py-4 font-mono text-[11px] tracking-wider text-text-dim">
          <span>no anonymous access</span>
          <span className="text-hairline">·</span>
          <span>org isolation at every layer</span>
          <span className="text-hairline">·</span>
          <span>full audit trail</span>
          <span className="text-hairline">·</span>
          <span>encrypted in transit</span>
        </section>

        {/* Feature process monitor */}
        <section className="py-20">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-mono text-sm uppercase tracking-widest text-text-dim">
              {'>'} system status
            </h2>
            <span className="font-mono text-[11px] text-signal-cipher">
              6 processes · all nominal
            </span>
          </div>

          <div className="overflow-hidden rounded-sm border border-hairline">
            <div className="hidden grid-cols-[3rem_9rem_7rem_1fr] gap-4 border-b border-hairline bg-[#0D1215] px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-text-dim sm:grid">
              <span>pid</span>
              <span>process</span>
              <span>status</span>
              <span>description</span>
            </div>
            {FEATURES.map((f, i) => (
              <div
                key={f.label}
                className={`grid grid-cols-[3rem_1fr] gap-2 px-4 py-4 transition-colors hover:bg-[#0D1215] sm:grid-cols-[3rem_9rem_7rem_1fr] sm:items-center sm:gap-4 ${
                  i !== FEATURES.length - 1 ? 'border-b border-hairline' : ''
                }`}
              >
                <span className="font-mono text-xs text-text-dim">{f.pid}</span>
                <span className="font-mono text-sm text-text-primary">{f.label}</span>
                <span className="hidden sm:block">
                  <StatusTag>{f.status}</StatusTag>
                </span>
                <span className="col-span-2 text-sm text-text-secondary sm:col-span-1">
                  {f.text}
                </span>
                <span className="col-span-2 -mt-1 sm:hidden">
                  <StatusTag>{f.status}</StatusTag>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Isolation diagram */}
        <section className="py-8 pb-20">
          <h2 className="mb-6 font-mono text-sm uppercase tracking-widest text-text-dim">
            {'>'} how isolation holds
          </h2>
          <IsolationDiagram />
        </section>

        {/* CTA */}
        <section className="border-t border-hairline py-16">
          <div className="rounded-sm border border-hairline bg-[#0D1215] px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-text-dim">
                  {'>'} ready when you are
                </div>
                <p className="mt-2 max-w-sm text-text-secondary">
                  Stand up a verified, isolated workspace for your organization
                  in minutes.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link to="/register">
                  <Button className="font-mono">get started</Button>
                </Link>
                <Link to="/login">
                  <Button variant="ghost" className="font-mono">
                    sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 px-6 font-mono text-[11px] text-text-dim sm:flex-row sm:items-center">
          <span>qyx — enterprise communications, verified by default</span>
          <span>session logged · no message content retained here</span>
        </div>
      </footer>
    </div>
  );
}