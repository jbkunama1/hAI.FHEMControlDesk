# FHEM Control Desk – Einrichtung, FHEM-Stack-Integration & `.env`-Referenz

Diese Anleitung erklärt Schritt für Schritt, **was**, **wann**, **wo** und **warum** eingetragen werden muss, um **FHEM Control Desk** entweder als **exklusive WebUI** direkt in deinen neuen oder laufenden FHEM-Server-Stack einzubinden oder flexibel im Docker-Container (Heimnetz & Internet) zu betreiben.

---

## 1. Welcher Integrationsweg passt zu dir?

Wenn du **FHEM Control Desk als exklusive WebUI** betreiben willst, konfigurierst du deinen FHEM-Server zentral per `FHEM_UPSTREAM_URL` und `FHEM_EXCLUSIVE_MODE="true"` in der `.env`-Datei:
- **Zero-Click-Start:** Jeder angemeldete Benutzer landet sofort auf deinem echten FHEM-Server (keine Test-Instanz, kein manuelles Eintragen von IP/Passwort im Browser).
- **Zugangsdaten bleiben auf dem Server:** FHEM-Benutzername/Passwort verlassen niemals das Backend und werden nie an den Browser gesendet.
- **Altes FHEMWEB abschotten:** Port `8083` muss weder ins Internet noch ins lokale Netz freigegeben werden – FHEM spricht nur noch intern (Docker-Netzwerk oder `127.0.0.1`) mit FHEM Control Desk.

### Weg A: Neuer All-in-One-FHEM-Stack (Docker Compose – empfohlen für Neuinstallationen)
Startet **FHEM** und **FHEM Control Desk** gemeinsam in einem isolierten internen Docker-Netzwerk (`fhem_internal`). FHEM-Port `8083` bleibt komplett von außen unsichtbar; nach außen ist ausschließlich FHEM Control Desk auf Port `3000` (oder per Caddy HTTPS) erreichbar.

1. Beispiel-Konfiguration kopieren:
   ```bash
   cp .env.example .env
   ```
2. In `.env` mindestens setzen:
   ```env
   REQUIRE_LOGIN="true"
   ADMIN_BOOTSTRAP_TOKEN="MeinGeheimerEinmalCode2026!"
   FHEM_EXCLUSIVE_MODE="true"
   # Optional, falls FHEMWEB mit allowed/basicAuth geschützt ist:
   FHEM_UPSTREAM_USER=""
   FHEM_UPSTREAM_PASS=""
   ```
3. Kompletten Stack bauen und starten:
   ```bash
   docker compose -f docker-compose.stack.yml up -d --build
   ```
4. Im Browser öffnen (`http://<SERVER-IP>:3000` oder deine HTTPS-Domain) → Admin-Konto anlegen → **fertig**, dein FHEM-Server ist sofort verbunden.
   *(Tipp: USB-ZigBee-/Z-Wave-Sticks kannst du direkt im `devices:`-Abschnitt von `docker-compose.stack.yml` an den `fhem`-Container durchreichen.)*

---

### Weg B: Integration in einen laufenden FHEM-Server (Docker-Sidecar oder LAN-FHEM)
Du hast bereits einen laufenden FHEM-Server – entweder in einem anderen Docker-Container oder direkt auf dem Host / einem Raspberry Pi im Heimnetz.

1. Beispiel-Konfiguration kopieren:
   ```bash
   cp .env.example .env
   ```
2. Passende `FHEM_UPSTREAM_URL` in `.env` eintragen:
   - **FHEM läuft im selben Docker-Netzwerk** (Container-Name z. B. `fhem`):
     ```env
     FHEM_UPSTREAM_URL="http://fhem:8083/fhem"
     FHEM_EXCLUSIVE_MODE="true"
     ```
     *(In `docker-compose.yml` den auskommentierten `networks:`-Block für dein bestehendes FHEM-Netzwerk aktivieren.)*
   - **FHEM läuft nativ auf demselben Linux-Host** (ohne Docker):
     ```env
     FHEM_UPSTREAM_URL="http://host.docker.internal:8083/fhem"
     FHEM_EXCLUSIVE_MODE="true"
     ```
     *(In `docker-compose.yml` ist `host.docker.internal:host-gateway` bereits vorkonfiguriert.)*
   - **FHEM läuft auf einem anderen Gerät im LAN** (z. B. Raspberry Pi):
     ```env
     FHEM_UPSTREAM_URL="http://192.168.178.50:8083/fhem"
     FHEM_EXCLUSIVE_MODE="true"
     ```
   - Falls dein FHEMWEB ein Passwort (Basic Auth) oder API-Key hat, ergänze `FHEM_UPSTREAM_USER` + `FHEM_UPSTREAM_PASS` (bzw. `FHEM_UPSTREAM_API_KEY`).
3. Container starten:
   ```bash
   docker compose up -d --build
   ```

---

### Weg C: Natives Linux / Raspberry Pi (ohne Docker, direkt neben FHEM via `systemd`)
Ideal, wenn FHEM bereits klassisch per `apt`/Perl auf einem Raspberry Pi oder Debian-Server läuft und FHEM Control Desk direkt über `127.0.0.1:8083` angebunden werden soll.

1. Voraussetzungen: Node.js 22 LTS (`node -v`).
2. Projekt nach `/opt/fhem-control-desk` kopieren, installieren und Production-Bundle bauen:
   ```bash
   cd /opt/fhem-control-desk
   npm ci
   npm run build
   npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=server.mjs
   ```
3. Konfigurations- und Datenverzeichnis anlegen:
   ```bash
   sudo mkdir -p /etc/fhem-control-desk /var/lib/fhem-control-desk
   sudo cp .env.example /etc/fhem-control-desk/fhem-control-desk.env
   sudo chmod 600 /etc/fhem-control-desk/fhem-control-desk.env
   ```
   In `/etc/fhem-control-desk/fhem-control-desk.env` eintragen:
   ```env
   NODE_ENV="production"
   HOST="127.0.0.1"
   PORT="3000"
   DATA_DIR="/var/lib/fhem-control-desk"
   REQUIRE_LOGIN="true"
   ADMIN_BOOTSTRAP_TOKEN="MeinGeheimerEinmalCode2026!"
   FHEM_UPSTREAM_URL="http://127.0.0.1:8083/fhem"
   FHEM_EXCLUSIVE_MODE="true"
   FHEM_UPSTREAM_USER="desk_api"
   FHEM_UPSTREAM_PASS="StarkesInternesPasswort!"
   ```
4. Systemdienst installieren und aktivieren:
   ```bash
   sudo cp deploy/fhem-control-desk.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now fhem-control-desk
   sudo systemctl status fhem-control-desk
   ```
5. **FHEMWEB exklusiv absichern (empfohlen):** Siehe [`deploy/fhem-hardening.cfg.example`](./deploy/fhem-hardening.cfg.example) – damit sperrst du den alten FHEMWEB-Port auf `127.0.0.1` ein (inkl. `allowed`, `basicAuth`, `csrfToken random` und optionalem `SYSMON` für die Dashboard-Server-Gesundheitskarte).

> **Wichtig:** Die Datei `.env` enthält ggf. Zugangsdaten und wird automatisch durch `.gitignore` von Git ausgeschlossen. Lade deine ausgefüllte `.env` niemals in öffentliche Repositories hoch.

---

## 2. Alle `.env`-Variablen im Überblick (Was, Wann, Wo, Warum)

Alle Variablen werden in deiner eigenen `.env`-Datei **im selben Ordner wie `docker-compose.yml`** (bzw. unter `/etc/fhem-control-desk/fhem-control-desk.env` bei `systemd`) eingetragen.

### A. FHEM-Stack-Integration & Exklusiv-Modus (Empfohlen für Produktiv-Stacks)

| Variable | Pflicht? | Standard | Wann eintragen? | Warum wird sie gebraucht? |
| :--- | :--- | :--- | :--- | :--- |
| **`FHEM_UPSTREAM_URL`** | Optional (Pflicht für Stack-Modus) | *(leer)* | Immer, wenn FHEM Control Desk fest mit deinem FHEM-Server verbunden sein soll (z. B. `http://fhem:8083/fhem`, `http://127.0.0.1:8083/fhem` oder `http://192.168.178.50:8083/fhem`). | Aktiviert die serverseitige FHEM-Anbindung. Alle Benutzer sind nach dem Login sofort verbunden, ohne Serverdaten im Browser einzugeben. |
| **`FHEM_EXCLUSIVE_MODE`** | Optional | `true` *(sobald URL gesetzt)* | Auf `true` lassen für **exklusive WebUI**. Nur auf `false` setzen, wenn Nutzer zusätzlich Test-Instanz oder andere FHEM-Hosts wählen dürfen. | Sperrt serverseitig alle FHEM-Anfragen strikt auf `FHEM_UPSTREAM_URL`, blendet Test-Instanz und Host-Änderung in der UI aus und verhindert fremde Ziel-Hosts. |
| **`FHEM_UPSTREAM_USER`** & **`FHEM_UPSTREAM_PASS`** | Optional | *(leer)* | Wenn dein FHEMWEB mit `allowed` / `basicAuth` geschützt ist. | Wird ausschließlich im Backend als HTTP Basic Auth gesendet – niemals an den Browser übertragen. |
| **`FHEM_UPSTREAM_AUTH_TYPE`** | Optional | *(auto)* | Meist leer lassen (automatische Erkennung). Explizit: `none`, `basic`, `apikey`, `custom_header`, `query_token`. | Steuert das Auth-Verfahren zum internen FHEM-Server. |
| **`FHEM_UPSTREAM_API_KEY`** / **`HEADER_*`** / **`QUERY_*`** | Optional | *(leer)* | Nur bei Bearer-Token, eigenem Auth-Header oder Query-Token vor FHEM. | Alternative Auth-Verfahren zu Basic Auth, vollständig serverseitig gekapselt. |
| **`FHEM_UPSTREAM_CSRF_MODE`** & **`FHEM_UPSTREAM_CSRF_TOKEN`** | Optional | `auto` | Standard `auto` funktioniert direkt mit FHEM `csrfToken random`. | Erkennt das FHEMWEB-CSRF-Token automatisch; alternativ `manual` + Token oder `none`. |
| **`FHEM_UPSTREAM_METHOD`** | Optional | `GET` | Standard `GET` (oder `POST`, falls dein FHEM-Proxy POST bevorzugt). | HTTP-Methode zum internen FHEMWEB-Endpunkt. |
| **`FHEM_UPSTREAM_ACCEPT_SELF_SIGNED`** | Optional | `false` | Nur auf `true`, wenn `FHEM_UPSTREAM_URL` per `https://` ein selbstsigniertes LAN-Zertifikat nutzt. | Erlaubt selbstsignierte Zertifikate für die interne Verbindung zu FHEM. |

### B. Sicherheit, Login, Freigaben & KI

| Variable | Pflicht? | Standard | Wann eintragen? | Warum wird sie gebraucht? |
| :--- | :--- | :--- | :--- | :--- |
| **`REQUIRE_LOGIN`** | Empfohlen | `true` | Bei **Internet-Zugriff immer auf `true`** lassen. Nur in einem komplett isolierten LAN optional auf `false`. | Sperrt die gesamte Oberfläche sowie alle Backend-Routen (`/api/fhem/*`, `/api/ai/*`, `/api/profile`, `/api/admin/*`) serverseitig für nicht angemeldete Besucher. |
| **`ADMIN_BOOTSTRAP_TOKEN`** | Empfohlen beim Internet-Erststart | *(leer)* | **Vor dem allerersten Start**, wenn der Server sofort aus dem Internet erreichbar ist. | Verhindert, dass fremde Besucher aus dem Internet vor dir das erste Admin-Konto anlegen. Sobald dein Admin existiert, ist der Setup-Endpunkt dauerhaft gesperrt. |
| **`FHEM_ALLOWED_HOSTS`** | Nur ohne `FHEM_UPSTREAM_URL` | *(leer)* | Nur nötig, wenn du FHEM **nicht** per `FHEM_UPSTREAM_URL` vorgibst, sondern manuell in der App-UI verbindest. | Freigabeliste privater LAN-IPs/Hostnamen (kommagetrennt, z. B. `192.168.178.50,fhem.fritz.box`) für manuelle Verbindungen über den Server-Proxy. |
| **`APP_AUTH_USER`** & **`APP_AUTH_PASS`** | Optional | *(leer)* | Nur wenn du **zusätzlich** zum App-Login ein Browser-Passwortfenster (HTTP Basic Auth) vor die App setzen willst. | Schützt auch statische Dateien (HTML/JS/CSS) vor unbefugtem Abruf. **Beide** Werte müssen gesetzt sein – ist nur einer gesetzt, blockiert die App sicherheitshalber komplett. |
| **`DATA_DIR`** | Nein (Docker setzt `/app/data`) | `/app/data` (Docker) bzw. `./data` | Ändern bei nativer Installation ohne Docker (z. B. `/var/lib/fhem-control-desk`). | Speicherort für `users.json`, `sessions.json` und `profiles/<id>.json` (Favoriten, Themes, Raumfotos, ggf. verschlüsselter Tresor). |
| **`AI_BASE_URL`**, **`AI_API_KEY`**, **`AI_MODEL`** | Optional | *(leer)* | Nur wenn du dem KI-Assistenten feste Server-Standardwerte mitgeben möchtest. | Normalerweise trägst du den KI-Anbieter einfach in der App ein – er wird dann pro Benutzer verschlüsselt im Profil gespeichert. |
| **`AI_ALLOWED_HOSTS`** | Optional | *(leer)* | Nur wenn du einen **lokalen KI-Server im LAN** (z. B. Ollama auf `192.168.178.60`) über den Server-Proxy ansprichst. | Freigabeliste privater LAN-IPs für den KI-Proxy. |
| **`APP_URL`** | Optional | *(leer)* | Optional zu Dokumentationszwecken oder für externe Tools. | Öffentliche URL deiner Installation (z. B. `https://fhem.deinedomain.de`). |

---

## 3. Fertige `.env`-Beispiele für typische Szenarien

### Szenario A: Exklusive WebUI im FHEM-Stack + Internet-Zugriff (Empfohlen)
```env
REQUIRE_LOGIN="true"
ADMIN_BOOTSTRAP_TOKEN="MeinGeheimerEinmalCode2026!"

FHEM_UPSTREAM_URL="http://fhem:8083/fhem"
FHEM_EXCLUSIVE_MODE="true"
FHEM_UPSTREAM_CSRF_MODE="auto"
FHEM_UPSTREAM_USER="desk_api"
FHEM_UPSTREAM_PASS="StarkesInternesFhemPasswort!"
```

### Szenario B: Bestehendes FHEM im Heimnetz (LAN-IP) + zusätzliches HTTP Basic Auth
```env
REQUIRE_LOGIN="true"
ADMIN_BOOTSTRAP_TOKEN="MeinGeheimerEinmalCode2026!"
APP_AUTH_USER="meinzugang"
APP_AUTH_PASS="SehrLangesBasicAuthPasswort!"

FHEM_UPSTREAM_URL="http://192.168.178.50:8083/fhem"
FHEM_EXCLUSIVE_MODE="true"
FHEM_UPSTREAM_USER="fhemuser"
FHEM_UPSTREAM_PASS="FhemPasswort!"
```

### Szenario C: Flexibler Modus (FHEM-Server manuell in der App konfigurierbar)
Lasse `FHEM_UPSTREAM_URL` leer und gib stattdessen deine LAN-IPs frei:
```env
FHEM_ALLOWED_HOSTS="192.168.178.50,fhem.fritz.box"
REQUIRE_LOGIN="true"
```
*(Im rein isolierten Heimnetz ohne Internet-Zugriff kannst du optional `REQUIRE_LOGIN="false"` setzen.)*

---

## 4. Schritt-für-Schritt-Einrichtung nach dem Start

### Schritt 1: Erstes Admin-Konto anlegen
Öffne die App im Browser. Du landest automatisch auf dem Bildschirm **Ersteinrichtung – Admin-Konto anlegen**:
- Gib deinen gewünschten Benutzernamen, Anzeigenamen und ein sicheres Passwort (mind. 8 Zeichen) ein.
- Hast du `ADMIN_BOOTSTRAP_TOKEN` gesetzt, trage diesen einmalig im Feld **Einrichtungs-Code** ein.
- Ab diesem Moment ist die Ersteinrichtung dauerhaft gesperrt.

### Schritt 2: Verbindung prüfen
- **Im Stack-Modus (`FHEM_UPSTREAM_URL` gesetzt):** Du bist **sofort** mit deinem FHEM-Server verbunden – alle Geräte, Räume, Longpoll-Updates und Diagramme laden automatisch. Unter **Einstellungen → Server & Tresor** kannst du jederzeit einen Verbindungstest ausführen sowie Longpoll, Polling-Intervall und Timeout anpassen.
- **Im flexiblen Modus (ohne `FHEM_UPSTREAM_URL`):** Gehe auf **Einstellungen → Server & Tresor**, wähle **Echter FHEM-Server → Server-Proxy**, trage Host (passend zu `FHEM_ALLOWED_HOSTS`), Port (`8083`), Pfad (`/fhem`) und Zugangsdaten ein und klicke auf **Speichern**.

### Schritt 3: Weitere Geräte & Benutzer einrichten
- **Eigenes Smartphone / Tablet / PC:** Öffne deine URL, melde dich an (mit „Angemeldet bleiben“ für 30 Tage) → Favoriten, Kachelgrößen, Farbthemes, Raumfotos und Ansicht (`Auto`/`Mobil`/`Desktop`) werden automatisch synchronisiert.
- **Familie / Wand-Tablet:** Unter **Einstellungen → Profil & Benutzer** kannst du als Administrator beliebig viele weitere Konten anlegen. Im Stack-Modus nutzen alle Benutzer automatisch dieselbe serverseitige FHEM-Verbindung, ohne jemals das FHEM-Passwort kennen zu müssen.

---

## 5. HTTPS-Zertifikat & Reverse Proxy (Pflicht für Internet-Betrieb!)

Der Container spricht auf Port `3000` unverschlüsseltes HTTP. Für den Zugriff über das Internet **immer** einen HTTPS-Reverse-Proxy davorschalten, damit Passwörter und Sitzungs-Cookies ausschließlich TLS-verschlüsselt übertragen werden.

### Option 1: Caddy (am einfachsten, automatisches Let's Encrypt)
Beispiel-`Caddyfile` (auch direkt in `docker-compose.stack.yml` als auskommentierter Dienst vorbereitet):
```caddyfile
fhem.deinedomain.de {
    reverse_proxy fhem-control-desk:3000 {
        # Wichtig für Echtzeit-Longpoll (Server-Sent Events ohne Pufferung):
        flush_interval -1
    }
}
```
> **Tipp für rein lokale LAN-Domains ohne offene Ports:** Mit dem Caddy-DNS-Plugin (z. B. Cloudflare, DuckDNS, Hetzner, IONOS) holt sich Caddy per **DNS-01-Challenge** ein echtes Let's-Encrypt-Zertifikat ganz ohne Portfreigabe im Router.

### Option 2: Nginx Proxy Manager (komfortable Weboberfläche)
1. Neuen **Proxy Host** für `fhem.deinedomain.de` anlegen → Forward Hostname/IP: `<Docker-Host-IP>`, Port: `3000`.
2. Unter **SSL** ein Let's-Encrypt-Zertifikat anfordern und **Force SSL** + **HTTP/2 Support** aktivieren.
3. Unter **Advanced** folgende Zeilen eintragen, damit FHEM-Longpoll in Echtzeit ohne Verzögerung durchgereicht wird:
   ```nginx
   proxy_buffering off;
   proxy_cache off;
   proxy_read_timeout 3600s;
   ```

### Option 3: Tailscale (ohne eigene Domain & ohne Router-Portfreigabe)
Wenn nur deine eigenen Geräte zugreifen sollen, reicht `tailscale serve https / http://127.0.0.1:3000` – Tailscale erstellt automatisch ein gültiges `*.ts.net`-HTTPS-Zertifikat.

---

## 6. Updates & Backup

- **App aktualisieren (ohne Datenverlust):**
  ```bash
  # Einzel-Container / Sidecar:
  docker compose up -d --build

  # All-in-One FHEM-Stack:
  docker compose -f docker-compose.stack.yml up -d --build
  ```
  Alle Benutzerkonten, Profile und FHEM-Konfigurationen bleiben in den Docker-Volumes (`fhem_desk_data` bzw. `fhem_data`) erhalten.

- **Backup der Benutzer- & Profildaten erstellen:**
  ```bash
  docker run --rm \
    -v fhem_desk_data:/data:ro \
    -v "$(pwd)":/backup \
    alpine tar czf /backup/fhem-desk-backup.tar.gz -C /data .
  ```

- **Wichtiger Sicherheitshinweis zum Betrieb:**
  - `fhem-control-desk` **nicht** direkt auf Port `3000` ohne HTTPS ins Internet freigeben – immer hinter einem Reverse Proxy mit TLS betreiben.
  - Wenn der Reverse Proxy auf demselben Host läuft, binde den Port in Compose auf `127.0.0.1:3000:3000` (oder nutze das interne Docker-Netzwerk ohne Host-Port).
  - Im Stack-Modus FHEM Port `8083` **nicht** nach außen veröffentlichen – siehe auch [`deploy/fhem-hardening.cfg.example`](./deploy/fhem-hardening.cfg.example).
