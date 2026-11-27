# AGENTS.md – Technical Architecture & Codebase Map (FHEM Control Desk)

> **Purpose:** Machine- and agent-readable technical reference for **FHEM Control Desk**. Read this file before modifying the codebase, integrating the app into a larger home-server/reverse-proxy/container stack, extending device/API capabilities, or migrating persistence/auth backends.
>
> For end-user Docker setup & `.env` explanations (in German), see [`SETUP.md`](./SETUP.md) and [`.env.example`](./.env.example).

---

## 1. System Overview & Tech Stack

**FHEM Control Desk** is a full-stack German-language Smart Home control plane and FHEM server administration web app / PWA designed for self-hosting (Docker on `amd64` / `arm64` Raspberry Pi) and internet-facing deployment behind a TLS reverse proxy.

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`) | SPA + PWA (`vite-plugin-pwa`), icons via `lucide-react`, charts via `recharts` (lazy-loaded), animations via `motion`. |
| **Backend** | Node.js 22 (ESM), Express 4 (`server.ts`) | Single-process server: serves `/api/*` + Vite dev middleware in dev, or static `/dist` in production (`server.mjs` via `esbuild`). |
| **Persistence (Server)** | File-based JSON + AES-256-GCM encrypted per-user vaults (`server/userStore.ts`) | Stored in `DATA_DIR` (`/app/data` mounted to Docker volume `fhem_desk_data`). Zero external DB required. |
| **Persistence (Browser)** | Web Crypto API (AES-GCM) + IndexedDB (`src/lib/secureStorage.ts`) | Local encrypted cache for FHEM/AI credentials, preferences, custom room/device images, and local test-instance state. |
| **FHEM Protocol** | FHEMWEB (`GET`/`POST /fhem?cmd=...&XHR=1`), `jsonlist2`, `inform=type=status;filter=.*;fmt=JSON` Longpoll, `HTTPAPI` | Supports both **Server-Proxy** (recommended for Docker/HTTPS) and **Direct LAN** browser fetches, plus a built-in 201-device simulation engine. |
| **Default Port** | `3000` (`PORT` / `--port`, `HOST=0.0.0.0`) | Exposes unauthenticated `GET /api/health` for Docker `HEALTHCHECK`. |

---

## 2. Complete Repository Map

### Root Files
| Path | Role |
| :--- | :--- |
| `server.ts` | Main Express server: security headers, optional Basic Auth, auth/profile/admin routes, FHEM HTTP/HTTPS command proxy, FHEM SSE Longpoll proxy, OpenAI-compatible AI proxy, Vite middleware (dev) / `dist/` static serving (prod). |
| `server/userStore.ts` | `UserProfileStore` class: user registry (`users.json`), scrypt password hashing, in-memory sessions + per-user AES-256-GCM vault encryption (`profiles/<uuid>.json`), brute-force rate limiting, image URI sanitization, last-admin protection. |
| `Dockerfile` | Multi-stage Node 22 Alpine build: `vite build` → `dist/`, `esbuild server.ts` → `server.mjs`, non-root `node` user, `/app/data` volume, `HEALTHCHECK` on `/api/health`. |
| `docker-compose.yml` | Sidecar / existing-FHEM Compose service (`fhem-control-desk`) with `host.docker.internal:host-gateway`, optional external FHEM Docker network, persistent volume `fhem_desk_data:/app/data`, and `FHEM_UPSTREAM_*` pass-through. |
| `docker-compose.stack.yml` | All-in-One Docker Compose stack (`fhem/fhem:latest` + `fhem-control-desk` on isolated internal bridge network `fhem_internal`; FHEM port 8083 is not published to host; optional Caddy HTTPS template). |
| `deploy/fhem-control-desk.service` | Hardened Linux `systemd` unit for native Raspberry Pi / Debian hosts running FHEM directly on `127.0.0.1:8083`. |
| `deploy/fhem-hardening.cfg.example` | Ready-to-use FHEM configuration commands for isolated `WEB_DESK` (`allowfrom 127.0.0.1\|::1`, `allowed` + `basicAuth`, `csrfToken random`), locking legacy port 8083 `WEB`, and `SYSMON` setup for the Dashboard Server Health card. |
| `.env.example` | Documented environment variable template (including `FHEM_UPSTREAM_*` and `FHEM_EXCLUSIVE_MODE`; no real secrets). |
| `SETUP.md` | German operator guide for All-in-One Docker stack, existing FHEM sidecar, native `systemd` setup, `.env`, HTTPS reverse proxies (Caddy, Nginx Proxy Manager, Tailscale), and backups. |
| `vite.config.ts` | Vite 8 + React + Tailwind v4 + `vite-plugin-pwa` manifest/service-worker config. |
| `index.html` | SPA HTML entry point, fonts, meta tags, PWA icons. |
| `package.json` | Dependencies & scripts (`dev`, `start`, `build`, `lint`). |

### Frontend Core (`src/`)
| Path | Role |
| :--- | :--- |
| `src/main.tsx` | React root mount (`<App />`) + global CSS import. |
| `src/index.css` | Tailwind v4 `@import "tailwindcss";` + Material Design 3 CSS custom properties (`--m3-surface`, `--accent-ring`, `.theme-canvas`, `.theme-surface`, `.theme-tonal`, `.theme-btn-primary`, `.theme-border`) driven by `<html data-theme="..." class="dark">`. |
| `src/App.tsx` | Central state coordinator: local keystore bootstrap, server auth status check, `AuthGateScreen` gating, debounced cross-device profile auto-sync (`1200ms`), FHEM device refresh, Longpoll subscription + fallback polling, command execution, modals, and tab routing. |
| `src/types/fhem.ts` | All shared TypeScript interfaces (`FhemConnectionConfig`, `FhemDevice`, `FhemLongpollUpdate`, `AppPreferences`, `CustomMediaStore`, `AiAssistantConfig`, `UserAccount`, `AuthStatus`, `SyncedUserProfile`, `ScheduleEntry`, etc.). |
| `src/hooks/usePWAInstall.ts` | PWA `beforeinstallprompt` hook + `useOnlineStatus()` browser network state hook. |

### Frontend Libraries (`src/lib/`)
| Path | Role |
| :--- | :--- |
| `src/lib/fhemClient.ts` | FHEM API client: URL builder, `executeFhemCommand()` (local engine / direct LAN / `/api/fhem/execute`), `fetchAllFhemDevices()` (`jsonlist2` parser & device categorizer/capability detector), `startFhemLongpoll()` (local bus / direct LAN / `/api/fhem/longpoll` SSE reader + reconnect backoff), `applyLongpollUpdateToDevices()`, `extractSchedulesFromDevices()`, and `localFhemEngine` (201-device sandbox). |
| `src/lib/fhemSeedData.ts` | Seed data generator for the built-in 201-device (108 ZigBee) FHEM test instance, initial events, and logs. |
| `src/lib/profileClient.ts` | REST client for `/api/auth/*`, `/api/profile`, and `/api/admin/users`. Stores `activeSessionToken` **strictly in JS module memory** (never `localStorage`/`sessionStorage`) and attaches `X-Session-Token` + `X-Requested-With: FHEM-Control-Desk`. |
| `src/lib/secureStorage.ts` | Browser-side persistence: IndexedDB store + Web Crypto AES-GCM encryption for local copies of `FhemConnectionConfig` and `AiAssistantConfig`, plus `AppPreferences`, `CustomMediaStore`, and sandbox snapshots. |
| `src/lib/aiClient.ts` | OpenAI-compatible chat client supporting direct LAN (e.g. Ollama) and `/api/ai/chat` server proxy, plus local commandref fallback. |
| `src/lib/fhemCommandref.ts` | Offline FHEM commandref knowledge base, system prompt builder, and FHEM command extractor/safety classifier (`requiresConfirm`). |
| `src/lib/roomVisuals.ts` | Default/custom room & device image resolver. |
| `src/lib/sensorHistory.ts` | Chartability detection (`isDeviceChartable`), automatic FHEM `DbLog` & `FileLog` discovery (`discoverFhemLogDevices`, `matchFileLogsForDevice`), safe `get <log> - - <from> <to> <spec>` command builders, output parser (`parseFhemLogOutput`), downsampling, 60s TTL cache, and async history loader (`fetchFhemSensorHistory`) for `ChartsView`. |
| `src/lib/themes.ts` | Material 3 theme registry (`getThemeDefinition`) for light/dark canvas colors and accent palettes. |

### Frontend UI Components (`src/components/`)
| Component | Role |
| :--- | :--- |
| `AuthGateScreen.tsx` | Full-screen login & first-run admin bootstrap gate rendered when `authStatus.requireLogin && !currentUser`. |
| `AccountModal.tsx` | Modal for login, bootstrap, manual pull/push profile sync, own password change (re-encrypts vault), and logout. |
| `ProfileAdminSection.tsx` | Settings tab (`Profil & Benutzer`): sync controls + Admin RBAC user management (list, create, role toggle, password reset, delete). |
| `AppHeader.tsx` | Sticky top bar: online/latency/Longpoll status, unsaved `fhem.cfg` indicator, global search trigger, theme picker, AI shortcut, profile initials button, refresh. |
| `BottomNav.tsx` | Responsive desktop sidebar (with room quick-list and theme switch) + mobile bottom navigation bar. |
| `DashboardView.tsx` | Home view: KPI overview, favorite device cards with drag-and-drop / reorder, compact/large tile toggles, grid/room grouping, `appOptions` sync. |
| `RoomsView.tsx` | Room gallery with room hero imagery and per-room device controls. |
| `DevicesView.tsx` | Filterable/searchable full device inventory (`all`, `active`, `zigbee`, `error`, `favorites`, room filter) + Define Device trigger. |
| `DeviceControlCard.tsx` | Reusable smart-home device card (toggle, dimmer slider, thermostat setpoint, shutter position, RGB/CT quick color swatch, ZigBee LQI/battery badges). |
| `DeviceDetailSheet.tsx` | Bottom sheet / side drawer for full device control, RGB/CT `ColorPickerControl`, live readings, attributes, raw `set`/`attr` commands, chart shortcut, and delete. |
| `ColorPickerControl.tsx` | Interactive HSV color wheel, brightness/saturation, presets, and color-temperature (Kelvin/Mired) picker generating FHEM `rgb`/`ct`/`xy` commands. |
| `CalendarView.tsx` | Schedule overview & editor for FHEM `at`, `WeekdayTimer`, `DOIF`, and timer devices. |
| `ChartsView.tsx` | Lazy-loaded Recharts time-series visualization with real FHEM `DbLog` & `FileLog` history fetching (auto-detection, manual source override, dual-axis & room comparison alignment, downsampling, CSV export). |
| `AiAssistantView.tsx` | Natural-language FHEM assistant with inline executable command cards and confirmation dialogs for mutating commands. |
| `SettingsView.tsx` | 5-tab settings hub: `Server & Tresor` (connection wizard + Mixed-Content HTTPS helper), `Profil & Benutzer`, `Server-Admin` (FHEM console, `save`, restart/shutdown), `Events & Logfile`, `Design & Bilder` (themes, room photos, PWA install, local reset). |
| `GlobalSearchModal.tsx` | Quick command/device/reading search (`/` or `Ctrl+K`). |
| `DefineDeviceModal.tsx` | Guided FHEM `define` wizard. |
| `MediaPickerModal.tsx` | Upload/URL picker for custom room, device, and floorplan images. |
| `ThemePicker.tsx` | `ThemeGallery` + `ThemeQuickModal` for Light/Dark and accent theme selection. |
| `ConfirmDialog.tsx` | Reusable confirmation dialog for destructive FHEM actions (`delete`, `shutdown`, `restart`, `save`, AI mutations). |
| `SmartVisualImage.tsx` | Resilient image renderer with fallback handling. |
| `PWAInstallButton.tsx` | Install-to-homescreen prompt button. |

---

## 3. Backend Middleware Pipeline & API Contract (`server.ts`)

### Request Processing Order
1. `app.disable('x-powered-by')` & `app.set('trust proxy', 1)` (preserves real client IP behind 1 reverse-proxy hop for rate limiting).
2. **Security Headers Middleware:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security` when `req.secure || x-forwarded-proto === 'https'`.
3. **Scoped JSON Body Parser:** `6mb` limit for `/api/profile` (room/device base64 photos), `1mb` limit for all other routes.
4. **`GET /api/health`** (unauthenticated liveness probe for Docker `HEALTHCHECK`).
5. **Optional HTTP Basic Auth Middleware (`createAppBasicAuthMiddleware`):**
   - Active **only** when `NODE_ENV === 'production'` (or `FORCE_BASIC_AUTH=true`) **and** `APP_AUTH_USER`/`APP_AUTH_PASS` are set.
   - Uses SHA-256 + `crypto.timingSafeEqual`. Fails closed (`503`) if only one of user/pass is configured.
   - Bypasses dev preview iframes (browsers block native Basic Auth prompts in cross-origin iframes).
6. **API Routes** (see table below).
7. **Frontend Serving:** Vite middleware (`NODE_ENV !== 'production'`) or `express.static('dist')` + SPA fallback `index.html` (`NODE_ENV === 'production'`).

### HTTP / SSE Endpoints
All state-changing routes (`POST`, `PUT`, `PATCH`, `DELETE`) require header `X-Requested-With: FHEM-Control-Desk` (returns `403 CSRF_HEADER_MISSING` otherwise) and verify that `Origin` (when sent by browsers) matches `X-Forwarded-Host`/`Host` (`403 ORIGIN_MISMATCH`).

Session authentication accepts `X-Session-Token: <token>`, `Authorization: Bearer <token>`, or the **`HttpOnly` cookie `fhem_desk_session`** (set automatically on login/bootstrap; `HttpOnly; Secure; SameSite=None; Partitioned` over HTTPS, `HttpOnly; SameSite=Lax` over plain LAN HTTP; `Max-Age=2592000` when `rememberMe: true`).

| Method | Path | Auth Required | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | None | Healthcheck (`{status: "ok", timestamp}`). |
| `GET` | `/api/auth/status` | Optional | Returns `{ok, initialized, authenticated, user, userCount (0 if unauthed), requireLogin, bootstrapTokenRequired, managedFhem}`. When `FHEM_UPSTREAM_URL` is configured, `managedFhem` exposes non-secret target metadata only when authenticated (or `!requireLogin`); otherwise only `{enabled, exclusive}`. |
| `POST` | `/api/auth/bootstrap` | One-time (0 users) + optional `ADMIN_BOOTSTRAP_TOKEN` | Creates first `admin` user and returns `{ok, token, user}`. Permanently returns `409` once any user exists. |
| `POST` | `/api/auth/login` | None (rate-limited) | Verifies credentials (`scrypt` + `timingSafeEqual`), derives vault key in RAM, returns `{ok, token, user}`. `429` after 10 failures / 5 min per IP. |
| `POST` | `/api/auth/logout` | Optional | Revokes current session token from RAM. |
| `POST` | `/api/auth/change-password` | Session | Verifies `currentPassword`, re-hashes password, re-encrypts user's profile vault with new key. |
| `GET` | `/api/profile` | Session | Loads & decrypts current user's synced profile (`config`, `aiConfig`, `preferences`, `customMedia`). |
| `PUT` | `/api/profile` | Session | Sanitizes URLs, encrypts sensitive FHEM/AI fields into per-user AES-256-GCM vault, atomically writes `profiles/<uuid>.json`. |
| `GET` | `/api/admin/users` | Session + `role === 'admin'` | Lists all user accounts (metadata only, never hashes/salts). |
| `POST` | `/api/admin/users` | Session + `role === 'admin'` | Creates a new `user` or `admin` account. |
| `PATCH` | `/api/admin/users/:id` | Session + `role === 'admin'` | Updates `displayName`, `role` (blocks demoting last admin), or resets `newPassword`. |
| `DELETE` | `/api/admin/users/:id` | Session + `role === 'admin'` | Deletes user + profile file + active sessions (blocks deleting last admin). |
| `POST` | `/api/fhem/execute` | Session (when `REQUIRE_LOGIN !== 'false'`) | Proxies FHEM command (`GET`/`POST`), auto-fetches `X-FHEM-csrfToken` if `csrfMode === 'auto'`. In Server-Managed Stack Mode (`FHEM_EXCLUSIVE_MODE=true` or `body.useServerUpstream === true`), ignores client host/credentials and routes strictly to `FHEM_UPSTREAM_URL`; otherwise enforces `validateTargetHost`. |
| `POST` | `/api/fhem/longpoll` | Session (when `REQUIRE_LOGIN !== 'false'`) | Opens upstream FHEM `inform=type=status;filter=.*;fmt=JSON` stream and relays lines to browser as `text/event-stream` (SSE). Uses server-managed upstream routing identically to `/api/fhem/execute`. |
| `POST` | `/api/ai/chat` | Session (when `REQUIRE_LOGIN !== 'false'`) | Proxies OpenAI-compatible `/chat/completions` requests with `validateTargetHost(..., 'AI_ALLOWED_HOSTS')`. |

---

## 4. Security, Encryption & Persistence Internals

### Server-Side Storage Layout (`DATA_DIR`, default `/app/data`)
```text
$DATA_DIR/                (chmod 0700)
├── users.json            (chmod 0600 — id, username, displayName, role, passwordSalt, passwordHash, vaultSalt, createdAt, lastLoginAt)
├── sessions.json         (chmod 0600 — persistent remember-me sessions: SHA-256 tokenHash + AES-256-GCM token-wrapped vaultKey + expiresAt)
└── profiles/             (chmod 0700)
    └── <uuid-v4>.json    (chmod 0600 — public preferences/media/non-secret config + AES-256-GCM encryptedSecrets blob)
```

- **Password Hashing:** `crypto.scrypt(password, salt, 64, {N: 16384, r: 8, p: 1})` verified via `crypto.timingSafeEqual`.
- **Zero-Plaintext Credential Vault & Persistent Remember-Me:** On login/bootstrap, `server/userStore.ts` derives a 32-byte AES-256-GCM vault key from `(password, user.vaultSalt)`. Sensitive fields (`config.password`, `config.apiKey`, `config.customHeaderValue`, `config.queryTokenValue`, `config.csrfToken`, `aiConfig.apiKey`) are stripped from plaintext JSON and stored exclusively inside `encryptedSecrets` (`iv`, `tag`, `ciphertext`). When `rememberMe: true` (30-day TTL), `sessions.json` stores only `SHA-256(rawToken)` plus `vaultKey` wrapped with `AES-256-GCM(SHA-256("fhem-session-wrap:v1:" + rawToken))` — so disk backups alone cannot unwrap any vault key without the browser's `HttpOnly` cookie token, yet sessions seamlessly survive page reloads and container restarts. Non-persistent sessions (`rememberMe: false`, 24-hour TTL) stay strictly in server RAM.
- **Admin Password Reset Caveat:** Because the vault key is derived from the user's password, an admin resetting another user's password clears that user's `encryptedSecrets` blob (non-secret preferences/favorites/themes/images remain intact); the user simply re-enters their FHEM password once after logging in.
- **Atomic Writes & Path Safety:** Every file write uses `<file>.<random>.tmp` + `fs.rename()`. Profile IDs are validated against strict UUID v4 regex + `path.resolve` prefix check (`resolved.startsWith(profilesDir + path.sep)`).
- **SSRF Protection (`validateTargetHost` in `server.ts`):** Always blocks loopback (`127.0.0.0/8`, `::1`, `localhost`), link-local/cloud metadata (`169.254.x.x`, `fe80::/10`, `metadata.google.internal`). Private RFC1918/CGNAT/ULA LAN addresses (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `fc00::/7`) are blocked unless explicitly listed in `FHEM_ALLOWED_HOSTS` (or `AI_ALLOWED_HOSTS` for AI proxy).

---

## 5. Key Data Flows (How Frontend & Backend Interact)

### Startup & Login Flow (`src/App.tsx`)
1. `App.tsx` loads local IndexedDB/encrypted keystore data in parallel with `GET /api/auth/status`.
2. If `authStatus.requireLogin === true` and `!currentUser`:
   - `App.tsx` renders `<AuthGateScreen />` instead of the main workspace.
   - `refreshDevices()`, `startFhemLongpoll()`, and the polling timer do **not** run.
3. On successful bootstrap or login:
   - `profileClient.ts` stores `token` in module RAM.
   - **Bootstrap:** Pushes current local state to `PUT /api/profile` and loads devices.
   - **Login:** Pulls `GET /api/profile`, merges with defaults, persists locally to IndexedDB/WebCrypto keystore, suppresses auto-push for `1500ms` (`suppressAutoSyncRef`), and triggers `refreshDevices(mergedConfig)`.
4. While signed in, any change to `config`, `aiConfig`, `preferences`, or `customMedia` triggers a debounced (`1200ms`) `PUT /api/profile`.

### FHEM Execution & Longpoll Flow (`src/lib/fhemClient.ts`)
- **`config.mode === 'local_instance'`:** Handled entirely in-browser by `localFhemEngine` (no backend proxy calls).
- **`config.mode === 'remote_server' && config.transport === 'proxy'`:**
  - Commands go to `POST /api/fhem/execute` with `X-Session-Token`.
  - Real-time updates go to `POST /api/fhem/longpoll` (`text/event-stream`); incoming `data:` JSON lines are parsed by `parseFhemLongpollLine()` and applied via `applyLongpollUpdateToDevices()`.
  - While Longpoll is `connected`, fallback polling relaxes to `max(pollIntervalSec * 4, 60)` seconds.
- **`config.mode === 'remote_server' && config.transport === 'direct'`:** Browser fetches FHEM directly on the LAN (requires CORS + matching HTTP/HTTPS protocol on FHEMWEB).

---

## 6. Integration & Extension Guide (For Agents Embedding This App)

### A. Integrating into an Existing Docker / Reverse-Proxy Stack
- Attach `fhem-control-desk` to your proxy Docker network (e.g. `proxy` or `traefik_net`) and remove the host `ports: "3000:3000"` binding (or bind `127.0.0.1:3000:3000`).
- **Critical for Longpoll (SSE):** Disable proxy response buffering (`flush_interval -1` in Caddy; `proxy_buffering off; proxy_read_timeout 3600s;` in Nginx/NPM; Traefik streams SSE by default).
- **Reverse-Proxy Hops:** If more than 1 proxy hop sits in front of Express (e.g., Cloudflare → Traefik → container), adjust `app.set('trust proxy', 1)` in `server.ts` to the exact hop count so rate limiting uses the real client IP.
- **Subdomain vs Subpath:** The app assumes root mounting (`/`), using absolute `/api/*` and `/icon.svg` paths. Always deploy on a dedicated subdomain (e.g. `fhem.example.com`) rather than a subpath unless you add Vite `base` + Express router prefixing.
- **Exclusive FHEM-Stack Mode (Recommended):** Set `FHEM_UPSTREAM_URL` (e.g., `http://fhem:8083/fhem` on a shared Docker bridge, `http://127.0.0.1:8083/fhem` on native Linux/systemd, or `http://host.docker.internal:8083/fhem` from a sidecar container) + `FHEM_EXCLUSIVE_MODE=true` + optional `FHEM_UPSTREAM_USER`/`FHEM_UPSTREAM_PASS`. Do **not** publish FHEM port `8083` to the host. `server.ts` routes all `/api/fhem/execute` and `/api/fhem/longpoll` calls strictly to the env-configured upstream (`resolveEffectiveFhemConnection`), keeping FHEM credentials strictly server-side, hiding the test sandbox and arbitrary host selectors in the UI, and auto-connecting every user after login.
- **Manual / Multi-Server Mode:** Leave `FHEM_UPSTREAM_URL` empty, set `FHEM_ALLOWED_HOSTS="<fhem-service-name-or-lan-ip>"`, and configure the connection in the UI (`SettingsView`).

### B. Integrating External SSO / Forward Auth (Authelia, Authentik, Traefik ForwardAuth)
- If an external IdP handles authentication and injects a trusted header (e.g. `Remote-User` / `X-Authentik-Username`), you can:
  1. Either keep `REQUIRE_LOGIN=true` for per-user vault encryption (recommended, because the user's password derives the AES-256-GCM vault key), **or**
  2. Replace `userStore.getSessionFromToken()` in `server.ts` with trusted-proxy header verification **and** switch the vault key derivation in `server/userStore.ts` to a server-side master encryption key from `process.env.VAULT_MASTER_KEY` (32-byte hex/base64).

### C. Swapping File Persistence for a Database (PostgreSQL / SQLite)
- All server persistence is cleanly encapsulated behind `UserProfileStore` in `server/userStore.ts`.
- Preserve these public methods to swap storage without touching `server.ts` or any frontend code:
  - `getStatus(token)`
  - `bootstrapFirstAdmin({username, displayName, password})`
  - `login({username, password, clientKey})`
  - `logoutToken(token)`
  - `getSessionFromToken(token)`
  - `changeOwnPassword(session, currentPassword, newPassword)`
  - `getProfile(session)` / `saveProfile(session, body)`
  - `listUsers()` / `createUser(...)` / `updateUser(id, patch)` / `deleteUser(id)`

### D. Adding New FHEM Device Types or Controls
1. Extend `DeviceCategory` / `FhemDevice` capabilities in `src/types/fhem.ts`.
2. Update device classification and reading/command parsing in `src/lib/fhemClient.ts` (`normalizeFhemDevice` / `parseFhemLongpollLine`).
3. Render compact controls in `src/components/DeviceControlCard.tsx` and detailed controls in `src/components/DeviceDetailSheet.tsx`.
4. Optionally add realistic demo fixtures to `src/lib/fhemSeedData.ts`.

---

## 7. Environment Variables Reference (Quick Lookup)

| Variable | Default | Scope | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | `3000` | Server | HTTP listen port (overridable via `--port`). |
| `HOST` | `0.0.0.0` | Server | HTTP bind address (overridable via `--host`). |
| `NODE_ENV` | `development` | Server | Set `production` in Docker to serve `dist/` and activate optional Basic Auth. |
| `DATA_DIR` | `./data` (`/app/data` in Docker) | Server | Directory for `users.json` and `profiles/`. |
| `REQUIRE_LOGIN` | `true` | Server + UI | Enforces login gate & session check on `/api/fhem/*` and `/api/ai/*`. Set `false` only on trusted isolated LANs. |
| `ADMIN_BOOTSTRAP_TOKEN` | *(empty)* | Server + UI | Optional one-time secret required by `POST /api/auth/bootstrap` to prevent unauthorized first-admin claim. |
| `FHEM_UPSTREAM_URL` | *(empty)* | Server + UI | Fixed server-managed FHEMWEB endpoint (e.g., `http://fhem:8083/fhem` or `http://127.0.0.1:8083/fhem`). Enables Zero-Click Stack Mode; permits loopback/internal Docker hosts strictly from trusted `process.env` while always blocking link-local/cloud metadata. |
| `FHEM_EXCLUSIVE_MODE` | `true` *(when URL set)* | Server + UI | Locks all `/api/fhem/*` traffic to `FHEM_UPSTREAM_URL`, disables the local test sandbox and manual host overrides in the UI. Set `false` to offer `FHEM_UPSTREAM_URL` as an optional preset alongside manual hosts. |
| `FHEM_UPSTREAM_AUTH_TYPE` | *(auto)* | Server | `none`, `basic`, `apikey`, `custom_header`, or `query_token` (auto-detected if credential vars are present). |
| `FHEM_UPSTREAM_USER` / `FHEM_UPSTREAM_PASS` | *(empty)* | Server | Server-side HTTP Basic Auth credentials for `FHEM_UPSTREAM_URL` (never sent to browsers). |
| `FHEM_UPSTREAM_API_KEY` | *(empty)* | Server | Server-side Bearer token for `FHEM_UPSTREAM_URL`. |
| `FHEM_UPSTREAM_HEADER_NAME` / `FHEM_UPSTREAM_HEADER_VALUE` | *(empty)* | Server | Custom auth header for `FHEM_UPSTREAM_URL` (blocks hop-by-hop/Host header names). |
| `FHEM_UPSTREAM_QUERY_PARAM` / `FHEM_UPSTREAM_QUERY_VALUE` | *(empty)* | Server | Query-string auth token for `FHEM_UPSTREAM_URL`. |
| `FHEM_UPSTREAM_CSRF_MODE` / `FHEM_UPSTREAM_CSRF_TOKEN` | `auto` / *(empty)* | Server | `auto`, `manual`, or `none` CSRF handling against `FHEM_UPSTREAM_URL`. |
| `FHEM_UPSTREAM_METHOD` | `GET` | Server | `GET` or `POST` for upstream FHEMWEB command calls. |
| `FHEM_UPSTREAM_ACCEPT_SELF_SIGNED` | `false` | Server | Set `true` only if `FHEM_UPSTREAM_URL` uses `https://` with a self-signed LAN certificate. |
| `FHEM_ALLOWED_HOSTS` | *(empty)* | Server | Comma-separated allowlist of private LAN IPs/hostnames reachable via `/api/fhem/*` when not using exclusive upstream mode. |
| `APP_AUTH_USER` / `APP_AUTH_PASS` | *(empty)* | Server (prod) | Optional outer HTTP Basic Auth credentials (both required to enable; `FORCE_BASIC_AUTH=true` enables in dev). |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | *(empty)* | Server | Optional server-side defaults for `/api/ai/chat`. |
| `AI_ALLOWED_HOSTS` | *(empty)* | Server | Comma-separated allowlist of private LAN IPs/hostnames reachable via `/api/ai/chat`. |

---

## 8. Build, Verification & Deployment Commands

```bash
# Development server (Express + Vite middleware on port 3000)
npm run dev

# Type-check entire codebase
npm run lint

# Build production frontend bundle (outputs dist/)
npm run build

# Bundle production Express backend (same command used in Dockerfile)
npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=server.mjs

# Run production Docker stack
docker compose up -d --build
```
