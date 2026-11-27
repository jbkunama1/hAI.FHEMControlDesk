# FHEM Control Desk

[![Build Status](https://img.shields.io/github/actions/workflow/status/jbkunama1/hAI.FHEMControlDesk/ci.yml?branch=main&label=Build%20Status&logo=githubactions&logoColor=white)](https://github.com/jbkunama1/hAI.FHEMControlDesk/actions/workflows/ci.yml)
[![Docker Publish](https://img.shields.io/github/actions/workflow/status/jbkunama1/hAI.FHEMControlDesk/docker-publish.yml?branch=main&label=Docker%20Publish&logo=docker&logoColor=white)](https://github.com/jbkunama1/hAI.FHEMControlDesk/actions/workflows/docker-publish.yml)
[![Docker Pulls](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fjbkunama1%2Fhai.fhemcontroldesk&query=%24.pulls&label=Docker%20Pulls&logo=docker&logoColor=white&color=2496ED)](https://github.com/jbkunama1/hAI.FHEMControlDesk/pkgs/container/hai.fhemcontroldesk)
[![GHCR Image](https://img.shields.io/badge/ghcr.io-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white)](https://github.com/jbkunama1/hAI.FHEMControlDesk/pkgs/container/hai.fhemcontroldesk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?logo=opensourceinitiative&logoColor=white)](https://opensource.org/licenses/MIT)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 8](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white)](#features)

Moderne, deutschsprachige **Smart-Home-Weboberfläche & PWA** für [FHEM](https://fhem.de/) – entwickelt für den selbstgehosteten Betrieb im Heimnetz oder sicher über das Internet sowie als **exklusive WebUI** direkt integriert in deinen neuen oder laufenden FHEM-Server-Stack.

> Ausführliche Schritt-für-Schritt-Anleitung (Docker, Reverse Proxy, HTTPS, Backups): **[`SETUP.md`](./SETUP.md)**  
> Technische Architektur-Referenz (auch für Coding-Agents): **[`AGENTS.md`](./AGENTS.md)**

---

## Features

- **Geräteabhängige Ansichten (`Auto` / `Mobil` / `Desktop`):** Dedizierte Smartphone-Oberfläche mit kompakter Kopfzeile, Touch-optimierter Bottom-Navigation und eigenem Kachel-Layout plus vollwertigem Desktop-Dashboard.
- **Exklusiver FHEM-Stack-Modus:** Feste serverseitige FHEM-Anbindung (`FHEM_UPSTREAM_URL` + `FHEM_EXCLUSIVE_MODE=true`) ohne Test-Instanz und ohne manuelle Serverdaten im Browser – FHEM-Zugangsdaten bleiben vollständig auf dem Server.
- **Echtzeit-Status via Longpoll (SSE):** FHEMWEB-Longpoll wird serverseitig als Server-Sent Events an den Browser gestreamt (kein Mixed-Content, kein CORS-Problem).
- **Dashboard & Server-Zustandskarte:** Favoriten mit Drag & Drop, Raum-Galerie, KPI-Übersicht sowie Live-Anzeige von **CPU-Last, RAM-Verbrauch und Uptime** direkt über FHEM `readingsVal` (kompatibel mit `SYSMON`).
- **Echte Verlaufsdiagramme (`DbLog` & `FileLog`):** Automatische Log-Erkennung, Dual-Achsen- und Raum-Vergleiche, Downsampling und CSV-Export.
- **Benutzerkonten, Rollen & Profil-Sync:** Integriertes Login-Gate (`REQUIRE_LOGIN=true`), Admin-/Benutzer-Rollen, 30-Tage-`HttpOnly`-Sitzungen („Angemeldet bleiben“) und geräteübergreifende Synchronisation von Favoriten, Themes, Ansichten und Raumfotos (verschlüsselter Tresor mit `scrypt` + `AES-256-GCM`).
- **FHEM-Administration & optionaler KI-Assistent:** Live-Konsole, `save`/Restart-Steuerung, Event-Monitor, `define`-Assistent, Zeitpläne (`at`/`WeekdayTimer`/`DOIF`) und OpenAI-/Ollama-kompatibler KI-Assistent mit Bestätigungsdialog für schreibende Befehle.
- **Eingebaute Test-Instanz:** 201 simulierte Smart-Home-Geräte (inkl. 108 ZigBee-Geräte) zum sofortigen Ausprobieren ohne echten FHEM-Server.

---

## Architektur & Dateien

| Pfad | Beschreibung |
| :--- | :--- |
| `src/` | React-19-Frontend (PWA, dedizierte Mobil-/Desktop-Views, Recharts-Historie, Material-3-Themes) |
| `server.ts` | Express-Backend: Auth/Profil/Admin-API, FHEM-Befehls- & Longpoll-SSE-Proxy, AI-Proxy, `/api/health` |
| `server/userStore.ts` | Dateibasierte Benutzer-, Session- & `AES-256-GCM`-Tresor-Persistenz in `DATA_DIR` (`/app/data`) |
| `Dockerfile` | Multi-Stage-Build (`linux/amd64` + `linux/arm64`), Non-Root-User `node`, Healthcheck auf `/api/health` |
| `docker-compose.stack.yml` | **All-in-One-Stack:** FHEM (`fhem/fhem:latest`) + FHEM Control Desk im isolierten internen Netz (Port `8083` nicht exponiert) |
| `docker-compose.yml` | **Sidecar-Integration** für bestehende FHEM-Server (Docker-Netzwerk, `host.docker.internal` oder LAN-IP) |
| `docker-compose.portainer.yml` | **Portainer-Stack** mit vorgebautem GHCR-Image (`ghcr.io/jbkunama1/hai.fhemcontroldesk:latest`) & persistentem Volume |
| `deploy/fhem-control-desk.service` | Gehärtete Linux-`systemd`-Unit für natives FHEM auf Raspberry Pi / Debian (`127.0.0.1:8083`) |
| `deploy/fhem-hardening.cfg.example` | Kopierfertige FHEM-Befehle zum Abschotten von FHEMWEB + `SYSMON`-Setup |

---

## Schnellstart & Integrationswege

### 1. Neuer All-in-One-FHEM-Stack (Exklusive WebUI)
Startet FHEM und FHEM Control Desk gemeinsam in einem internen Docker-Netzwerk, ohne FHEM-Port `8083` nach außen freizugeben (zieht direkt das fertige GHCR-Image, kein lokaler Build nötig):
```bash
cp .env.example .env
# In .env mindestens REQUIRE_LOGIN="true" und ADMIN_BOOTSTRAP_TOKEN setzen
docker compose -f docker-compose.stack.yml pull
docker compose -f docker-compose.stack.yml up -d
```

### 2. Bestehender FHEM-Server (Docker Compose / Sidecar)
```bash
cp .env.example .env
# In .env FHEM_UPSTREAM_URL setzen, z. B.:
#   http://fhem:8083/fhem                  (gemeinsames Docker-Netzwerk)
#   http://host.docker.internal:8083/fhem  (natives FHEM auf demselben Host)
#   http://192.168.178.50:8083/fhem        (FHEM im LAN)
docker compose pull
docker compose up -d
```

### 3. Deployment mit Portainer (fertiges GHCR-Image)
1. **Stacks → Add stack → Web editor** öffnen und den Inhalt von [`docker-compose.portainer.yml`](./docker-compose.portainer.yml) einfügen *(alternativ per **Repository** direkt aus `https://github.com/jbkunama1/hAI.FHEMControlDesk`, Compose path `docker-compose.portainer.yml` oder `docker-compose.yml`)*.
2. Unter **Environment variables** die gewünschten Variablen setzen (mindestens `REQUIRE_LOGIN=true` sowie `FHEM_UPSTREAM_URL` oder `FHEM_ALLOWED_HOSTS`).
3. **Deploy the stack** – das Volume `fhem_desk_data:/app/data` sichert alle Benutzerkonten und Profile über Updates hinweg.

### 4. Natives Linux / Raspberry Pi (ohne Docker)
Vorlage für `systemd` und FHEMWEB-Härtung liegen in [`deploy/fhem-control-desk.service`](./deploy/fhem-control-desk.service) und [`deploy/fhem-hardening.cfg.example`](./deploy/fhem-hardening.cfg.example) – Details siehe [`SETUP.md`](./SETUP.md).

---

## Umgebungsvariablen (`.env`)

Vollständige Vorlage mit Kommentaren: [`.env.example`](./.env.example).

### Exklusiver FHEM-Stack-Modus (empfohlen)

| Variable | Default | Beschreibung |
| :--- | :--- | :--- |
| `FHEM_UPSTREAM_URL` | *(leer)* | Feste interne FHEMWEB-URL (z. B. `http://fhem:8083/fhem` oder `http://127.0.0.1:8083/fhem`). Aktiviert Zero-Click-Verbindung nach Login. |
| `FHEM_EXCLUSIVE_MODE` | `true` *(mit URL)* | `true` sperrt Test-Instanz und andere Ziel-Hosts komplett (exklusive WebUI); `false` erlaubt Umschalten. |
| `FHEM_UPSTREAM_USER` / `FHEM_UPSTREAM_PASS` | *(leer)* | Serverseitige HTTP-Basic-Auth-Zugangsdaten für FHEMWEB (werden nie an den Browser gesendet). |
| `FHEM_UPSTREAM_AUTH_TYPE` | *(auto)* | `none`, `basic`, `apikey`, `custom_header` oder `query_token` (automatische Erkennung wenn leer). |
| `FHEM_UPSTREAM_API_KEY` | *(leer)* | Serverseitiges Bearer-Token für FHEM / vorgeschalteten Proxy. |
| `FHEM_UPSTREAM_HEADER_NAME` / `FHEM_UPSTREAM_HEADER_VALUE` | *(leer)* | Optionaler eigener Auth-Header für FHEM. |
| `FHEM_UPSTREAM_QUERY_PARAM` / `FHEM_UPSTREAM_QUERY_VALUE` | *(leer)* | Optionales Query-Parameter-Token für FHEM. |
| `FHEM_UPSTREAM_CSRF_MODE` / `FHEM_UPSTREAM_CSRF_TOKEN` | `auto` / *(leer)* | FHEMWEB-CSRF-Behandlung (`auto`, `manual` oder `none`). |
| `FHEM_UPSTREAM_METHOD` | `GET` | HTTP-Methode (`GET` oder `POST`) zum FHEM-Server. |
| `FHEM_UPSTREAM_ACCEPT_SELF_SIGNED` | `false` | `true` erlaubt selbstsignierte Zertifikate bei interner `https://`-`FHEM_UPSTREAM_URL`. |

### Sicherheit, Benutzerkonten & Freigaben

| Variable | Default | Beschreibung |
| :--- | :--- | :--- |
| `REQUIRE_LOGIN` | `true` | Erzwingt Login-Bildschirm und schützt alle `/api/fhem/*`-, `/api/ai/*`-, Profil- und Admin-Routen serverseitig. Bei Internet-Zugriff immer auf `true` lassen. |
| `ADMIN_BOOTSTRAP_TOKEN` | *(leer)* | Optionaler einmaliger Einrichtungs-Code für das allererste Admin-Konto (verhindert fremde Übernahme beim Internet-Erststart). |
| `APP_AUTH_USER` / `APP_AUTH_PASS` | *(leer)* | Optionaler zusätzlicher HTTP-Basic-Auth-Schutz vor der gesamten App im Produktionsbetrieb (beide erforderlich). |
| `FHEM_ALLOWED_HOSTS` | *(leer)* | Kommagetrennte LAN-Hosts/-IPs, die im manuellen Modus (ohne `FHEM_UPSTREAM_URL`) über den Proxy erlaubt sind. |
| `DATA_DIR` | `/app/data` *(Docker)* / `./data` | Persistentes Verzeichnis für `users.json`, `sessions.json` und `profiles/<uuid>.json`. |

### Server, KI-Assistent & Betrieb

| Variable | Default | Beschreibung |
| :--- | :--- | :--- |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | HTTP-Listen-Port und Bind-Adresse. |
| `NODE_ENV` | `development` | Im Container `production` (serviert `dist/`, aktiviert optionales Basic Auth). |
| `TZ` | `Europe/Berlin` | Zeitzone im Container. |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | *(leer)* | Optionale Server-Standardwerte für OpenAI-kompatible KI-Endpunkte (z. B. OpenAI, OpenRouter, Ollama). |
| `AI_ALLOWED_HOSTS` | *(leer)* | Kommagetrennte LAN-Hosts/-IPs für lokale KI-Server (z. B. Ollama / LM Studio). |
| `APP_URL` | *(leer)* | Optionale öffentliche App-URL (Dokumentation / Metadaten). |

---

## Sicherheit & Internet-Betrieb

- **Login & Verschlüsselung:** Passwörter werden mit `scrypt` gehasht, Sitzungen laufen über `HttpOnly`-Cookies (inkl. optionalem 30-Tage-Login mit Token-geschütztem Vault-Key), und sensible Profildaten werden pro Benutzer mit `AES-256-GCM` verschlüsselt.
- **Zugangsdaten-Kapselung:** Im Stack-Modus (`FHEM_UPSTREAM_URL`) bleiben FHEM-Passwörter und interne Zieladressen strikt auf dem Server; nicht angemeldete Besucher sehen keine internen Hostnamen oder Ports.
- **Ziel-Schutz im Proxy:** Loopback- und Cloud-Metadaten-/Link-Local-Adressen sind für benutzerdefinierte Proxy-Ziele gesperrt; private LAN-Adressen erfordern explizite Freigabe über `FHEM_ALLOWED_HOSTS` / `AI_ALLOWED_HOSTS` (bzw. vertrauenswürdige Server-Konfiguration per `FHEM_UPSTREAM_URL`).
- **HTTPS-Reverse-Proxy:** Für Internet- und Handy-Zugriff (PWA & vertrauenswürdiges Zertifikat) immer hinter einem HTTPS-Proxy (z. B. **Caddy**, **Nginx Proxy Manager** oder **Tailscale**) betreiben und Antwort-Pufferung für Longpoll/SSE deaktivieren (`flush_interval -1` bzw. `proxy_buffering off;`). Details siehe [`SETUP.md`](./SETUP.md).

---

## Healthcheck & Entwicklung

- `GET /api/health` liefert `{ "status": "ok", "timestamp": ... }` für den Docker-`HEALTHCHECK`.

```bash
npm install
npm run dev      # Express + Vite-Middleware auf Port 3000
npm run lint     # TypeScript-Prüfung (tsc --noEmit)
npm run build    # Produktions-Frontend (dist/)
```
