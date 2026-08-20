CONTEXT
I have a monorepo called Qyx (pnpm workspace) with:
- apps/web — React 18 + TypeScript + Vite frontend, deployed to Cloudflare Pages at https://qyx.pages.dev
- apps/api-gateway — Hono.js backend on Cloudflare Workers, deployed at https://qyx.nikhilguleria20004-fc0.workers.dev

The frontend and backend are on DIFFERENT origins. Currently every API call in the frontend
uses a relative path (e.g. fetch('/v1/conversations')) and the WebSocket hook builds its URL
from window.location.host. This only works if frontend and backend share an origin, which they
don't in this deployment. I need you to connect them using an environment-variable-driven base
URL, plus enable CORS on the backend so the pages.dev origin is allowed to call the workers.dev
origin, including credentials and WebSocket upgrades.

Do NOT switch to a custom-domain/route-based architecture. Do NOT change relative path structure
of endpoints (e.g. keep '/v1/conversations'), just make the base resolvable via env var. Keep all
existing behavior (token refresh logic in lib/auth.ts, error handling shapes) identical.

TASK 1 — Create a centralized frontend config module
Create apps/web/src/lib/config.ts:

  export const API_BASE_URL: string =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

  export function apiUrl(path: string): string {
    // path always starts with '/', e.g. '/v1/conversations'
    return `${API_BASE_URL}${path}`;
  }

  export function wsUrl(path: string): string {
    if (API_BASE_URL) {
      // API_BASE_URL is an absolute http(s) URL — convert scheme to ws(s)
      return API_BASE_URL.replace(/^http/, 'ws') + path;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }

Also create/update apps/web/src/vite-env.d.ts (or wherever Vite's ImportMetaEnv is declared) to add:

  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
  }

TASK 2 — Update every frontend file that calls fetch() with a relative '/v1/...' path
to build the URL through apiUrl() from lib/config.ts instead of a bare string literal.
Do this in exactly these files, preserving all existing logic (headers, token refresh,
retry-on-401, error parsing) — only change how the URL string is constructed:

  - apps/web/src/lib/auth.ts
      Replace `fetch(\`/v1${path}\`, ...)` (both occurrences, including the retry call)
      and `fetch('/v1/auth/logout', ...)` with apiUrl-based equivalents, e.g.
      fetch(apiUrl(`/v1${path}`), ...) and fetch(apiUrl('/v1/auth/logout'), ...).
      Import { apiUrl } from './config'.

  - apps/web/src/features/admin/api/adminApi.ts
      It already has `const API_BASE = '/v1';` and does
      `fetch(\`${API_BASE}${path}\`, ...)`. Import { apiUrl } from '../../../lib/config'
      and change the fetch call to `fetch(apiUrl(\`${API_BASE}${path}\`), ...)`.

  - apps/web/src/features/app/api/filesApi.ts
      Three calls: '/v1/files/upload-url', '/v1/files/' + fileId + '/complete',
      '/v1/files/' + fileId + '/download-url'. Wrap each path in apiUrl(...).
      Do NOT wrap the uploadToR2/downloadFromR2 calls — those hit pre-signed URLs
      returned by the API and must stay untouched.
      Import { apiUrl } from '../../../lib/config'.

  - apps/web/src/features/app/api/messagesApi.ts
      Four calls: '/v1/conversations', `/v1/conversations/${conversationId}/messages${qs}`,
      `/v1/conversations/${conversationId}/messages` (POST),
      `/v1/conversations/${conversationId}/keys`. Wrap each in apiUrl(...).
      Import { apiUrl } from '../../../lib/config'.

  - apps/web/src/features/devices/api/devicesApi.ts
      Wrap every relative '/v1/me/devices...' path in apiUrl(...).
      Import { apiUrl } from '../../../lib/config'.

  - apps/web/src/features/auth/pages/LoginPage.tsx
  - apps/web/src/features/auth/pages/RegisterPage.tsx
  - apps/web/src/features/auth/pages/MfaPage.tsx
  - apps/web/src/features/auth/pages/SsoCallbackPage.tsx
  - apps/web/src/stores/authStore.ts
      Find every fetch('/v1/...') call in these files and wrap the path argument in
      apiUrl(...), importing apiUrl from the correct relative path to lib/config.ts.
      Preserve exact existing method/headers/body.

TASK 3 — WebSocket connection
In apps/web/src/features/app/hooks/useRealtime.ts, replace the manual
`const protocol = ...; const wsUrl = \`${protocol}//${window.location.host}/v1/realtime?...\`;`
construction with a call to `wsUrl('/v1/realtime?access_token=' + encodeURIComponent(token))`
imported from '../../../lib/config'. Remove the now-unused local `protocol` variable if
nothing else uses it.

TASK 4 — Enable CORS on the backend
In apps/api-gateway/src/index.ts:
  1. Add `import { cors } from 'hono/cors';` near the top (hono is already a dependency,
     hono/cors ships with it — no package.json change needed).
  2. Add `ALLOWED_ORIGIN: string;` to the Bindings type.
  3. Immediately after `const app = new Hono<{ Bindings: Bindings }>();` and BEFORE the
     existing `app.use('*', requestId);` line, add:

     app.use('*', (c, next) => {
       const corsMiddleware = cors({
         origin: (c.env.ALLOWED_ORIGIN || 'https://qyx.pages.dev').split(','),
         allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
         allowHeaders: ['Content-Type', 'Authorization'],
         exposeHeaders: ['Content-Length'],
         credentials: true,
         maxAge: 600,
       });
       return corsMiddleware(c, next);
     });

     (Wrapping it in a function that reads c.env is required because Hono's cors()
     origin option needs access to the per-request env binding, not a module-level
     constant — this repo has multiple environments/domains via wrangler.toml.)

TASK 5 — Add ALLOWED_ORIGIN to every wrangler config
Add a var ALLOWED_ORIGIN to apps/api-gateway/wrangler.toml under [env.staging.vars] and
[env.production.vars], and to apps/api-gateway/wrangler.dev.toml, wrangler.staging.toml,
and wrangler.prod.toml wherever a [vars] block already exists (follow the existing pattern
in each file exactly — some use [env.X.vars], some use a top-level [vars]). Set the value to:
  - dev/staging configs: "http://localhost:5173,https://qyx-web-staging.pages.dev"
  - prod config(s): "https://qyx.pages.dev"
Do not remove or reorder any existing keys in these files.

TASK 6 — Local dev support
In apps/web, create a .env.example file (if one doesn't exist) with:
  VITE_API_URL=http://localhost:8787
Add a note as a comment at the top: "# For production/preview builds on Cloudflare Pages,
set VITE_API_URL in the Pages project's Environment Variables dashboard instead of committing
a .env file."
Make sure .env is already covered by apps/web/.gitignore or the root .gitignore (check, and
add `apps/web/.env` if it's missing) so real env values are never committed. Do NOT commit
an actual .env file with real values.

TASK 7 — Realtime durable object / any other backend place with CORS-sensitive raw Response
Check apps/api-gateway/src/realtime/realtime.routes.ts and any file handling the WebSocket
upgrade (c.env.CONVERSATION_DO / CHANNEL_DO fetch, or a raw `new Response(null, {status:101,
webSocket: ...})`). WebSocket upgrade requests are not subject to CORS preflight, but confirm
no manual Origin-checking logic exists there that would reject https://qyx.pages.dev — if it
does, use the same ALLOWED_ORIGIN binding to validate the Origin header before upgrading.

CONSTRAINTS
- Do not change any request/response JSON shapes.
- Do not touch business logic, only URL construction and CORS middleware.
- Keep all changes TypeScript-strict-mode clean (no `any` introduced).
- Run `pnpm typecheck` and `pnpm lint` across apps/web and apps/api-gateway after changes and
  fix any errors those changes introduce.
- Do not modify migrations, schemas, or any file outside what's listed above.

AFTER YOU'RE DONE, summarize:
1. Every file you changed and why.
2. The exact Cloudflare Pages dashboard step I still need to do myself: setting
   VITE_API_URL = https://qyx.nikhilguleria20004-fc0.workers.dev as an environment variable
   on the qyx-web Pages project (Production and Preview), then triggering a redeploy.