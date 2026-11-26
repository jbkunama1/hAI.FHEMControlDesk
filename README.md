# FHEM Control Desk

Mobile-first Web-UI (React + Vite + Tailwind) zur Steuerung eines FHEM-Servers inkl. Express-Proxy für FHEMWEB (Befehle, Longpoll/SSE) und einen optionalen OpenAI-kompatiblen KI-Assistenten.

## Architektur

| Teil | Beschreibung |
|---|---|
| `src/` | React-Frontend (PWA) |
| `server.ts` | Express-Backend: `/api/fhem/execute`, `/api/fhem/longpoll`, `/api/ai/chat`, `/api/health` |
| `Dockerfile` | Multi-Stage-Build (amd64/arm64), Healthcheck auf `/api/health` |

## Schnellstart (Docker Compose)

```yaml
services:
  fhem-control-desk:
    build: .
    container_name: fhem-control-desk
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      FHEM_ALLOWED_HOSTS: "192.168.178.50"
      FHEM_HEALTH_HOST: "192.168.178.50"
      FHEM_HEALTH_PORT: 8083
      LOG_LEVEL: info
```

```bash
docker compose up -d --build
```

Danach ist die App unter `http://<host>:3000` erreichbar.

## Deployment mit Portainer

1. **Stacks → Add stack → Repository**.
2. Repository URL: `https://github.com/jbkunama1/hAI.FHEMControlDesk`, Reference `refs/heads/main`, Compose path `docker-compose.yml`.
3. Unter **Environment variables** die Werte aus der Tabelle unten setzen (mindestens `FHEM_ALLOWED_HOSTS`).
4. **Deploy the stack**. Portainer baut das Image selbst (`build: .`).

Hinweis: Im Web-Editor von Portainer funktioniert `build: .` nicht, weil dort kein Build-Kontext existiert. Nutze dafür den Repository-Modus oder ein vorab gebautes Image.

## Umgebungsvariablen

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `NODE_ENV` | – | `production` für den Container |
| `FHEM_ALLOWED_HOSTS` | leer | Kommagetrennte LAN-Hosts/-IPs, die der Proxy ansprechen darf |
| `AI_ALLOWED_HOSTS` | leer | Wie oben, für lokale KI-Server (Ollama, LM Studio, llama.cpp) |
| `AI_BASE_URL` | leer | Standard-Basis-URL der KI (z. B. `https://api.openai.com/v1`) |
| `AI_API_KEY` | leer | Wird **nur** an den Origin von `AI_BASE_URL` gesendet |
| `AI_MODEL` | leer | Standard-Modellname |
| `FHEM_HEALTH_HOST` | leer | Optional: Host für den FHEM-Ping bei `/api/health?deep=1` |
| `FHEM_HEALTH_PORT` | `8083` | Port für den FHEM-Ping |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## LAN-Modus und Proxy-Sperren

Der Server-Proxy blockiert aus Sicherheitsgründen immer Loopback, Link-Local/Cloud-Metadaten, Multicast und IPv4-mapped-Varianten davon. Private Adressen (RFC1918, `100.64.0.0/10`, IPv6 ULA) sind nur erreichbar, wenn der Host in `FHEM_ALLOWED_HOSTS` bzw. `AI_ALLOWED_HOSTS` steht.

- Läuft die App **lokal im Heimnetz** (Raspberry Pi, Portainer-Host): Host in `FHEM_ALLOWED_HOSTS` eintragen.
- Läuft die App **in der Cloud**: LAN-Ziele sind absichtlich gesperrt. Dann in den Einstellungen „Direktverbindung (LAN)“ nutzen, damit der Browser FHEM direkt anspricht.
- Der geprüfte Ziel-IP wird für die Verbindung fest verwendet (kein DNS-Rebinding). Redirects des KI-Endpunkts werden nicht verfolgt.

## Healthcheck

- `GET /api/health` liefert `status`, `timestamp`, `uptimeSec` (wird vom Docker-HEALTHCHECK genutzt).
- `GET /api/health?deep=1` pingt zusätzlich per TCP `FHEM_HEALTH_HOST:FHEM_HEALTH_PORT`. Ist FHEM nicht erreichbar, steht `status: "degraded"` in der Antwort. Der HTTP-Status bleibt 200, damit der Container nicht neu startet, nur weil FHEM gerade down ist.

## Logging

Ausgabe als JSON-Zeilen auf stdout/stderr (z. B. in Portainer unter Container-Logs). Es werden nur Methode, Pfad, Status, Dauer und Fehlercode protokolliert. Befehle, Query-Strings, Passwörter, Tokens und API-Keys werden nie geloggt.

## Sicherheit

- Der Proxy hat **keine eigene Authentifizierung**. Betreibe ihn nur im LAN/VPN oder hinter einem Reverse-Proxy mit Login (z. B. Cloudflare Access, Basic Auth).
- Zugangsdaten zum FHEM werden pro Anfrage vom Browser übermittelt.

## Entwicklung

```bash
npm install
npm run dev      # Express + Vite-Middleware
npm run lint     # tsc --noEmit
npm run build    # Frontend-Build
```
