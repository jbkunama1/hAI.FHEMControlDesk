import 'dotenv/config';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCliArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}

const PORT = Number(readCliArg('--port') || process.env.PORT) || 3000;
const HOST = readCliArg('--host') || process.env.HOST || '0.0.0.0';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB for large jsonlist2 payloads (200+ devices)
const STARTED_AT = Date.now();

// ---------------------------------------------------------------------------
// Structured logging (JSON lines, secrets are never logged)
// ---------------------------------------------------------------------------
const LOG_LEVELS = {debug: 10, info: 20, warn: 30, error: 40} as const;
type LogLevel = keyof typeof LOG_LEVELS;
const ACTIVE_LOG_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel] ?? LOG_LEVELS.info;
const SENSITIVE_KEY = /pass|token|key|secret|authorization|cookie|cmd|header/i;

function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  if (LOG_LEVELS[level] < ACTIVE_LOG_LEVEL) return;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : v;
  }
  const line = JSON.stringify({ts: new Date().toISOString(), level, msg, ...safe});
  if (level === 'error') console.error(line);
  else console.log(line);
}

interface FhemExecuteBody {
  protocol?: string;
  host?: string;
  port?: number;
  basePath?: string;
  httpMethod?: string;
  cmd?: string;
  csrfMode?: 'none' | 'auto' | 'manual';
  csrfToken?: string;
  authType?: 'none' | 'basic' | 'apikey' | 'custom_header' | 'query_token';
  username?: string;
  password?: string;
  apiKey?: string;
  customHeaderName?: string;
  customHeaderValue?: string;
  queryTokenParam?: string;
  queryTokenValue?: string;
  acceptSelfSigned?: boolean;
  timeoutMs?: number;
}

const BLOCKED_CUSTOM_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  'proxy-connection',
  'proxy-authorization',
]);

function getAllowedHosts(extraEnvKey?: string): Set<string> {
  const parts = [process.env.FHEM_ALLOWED_HOSTS || ''];
  if (extraEnvKey && process.env[extraEnvKey]) {
    parts.push(process.env[extraEnvKey] || '');
  }
  return new Set(
    parts
      .join(',')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

type IpClass = 'always_blocked' | 'private_lan' | 'public';

function classifyIpv4(ip: string): IpClass {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return 'always_blocked';
  }
  const [a, b] = p;
  // Loopback, unspecified/"this network", link-local (cloud metadata), multicast/reserved
  if (a === 127 || a === 0 || (a === 169 && b === 254) || a >= 224) {
    return 'always_blocked';
  }
  // RFC1918 private LAN and CGNAT (100.64.0.0/10, e.g. Tailscale) need an explicit allow-list entry
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
    return 'private_lan';
  }
  return 'public';
}

function expandIpv6(ip: string): number[] | null {
  let addr = ip.split('%')[0];
  const dotted = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const q = dotted[1].split('.').map(Number);
    if (q.some((n) => n > 255)) return null;
    addr = `${addr.slice(0, -dotted[1].length)}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? groups : null;
}

function classifyIpAddress(ip: string): IpClass {
  const normalized = ip.toLowerCase().trim().split('%')[0];

  if (net.isIPv4(normalized)) {
    return classifyIpv4(normalized);
  }

  if (net.isIPv6(normalized)) {
    const g = expandIpv6(normalized);
    if (!g) return 'always_blocked';
    const embeddedV4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    const upperZero = g.slice(0, 5).every((n) => n === 0);

    // ::/96 (unspecified, loopback, deprecated IPv4-compatible) -> never allowed
    if (upperZero && g[5] === 0) return 'always_blocked';
    // ::ffff:0:0/96 IPv4-mapped (dotted or hex notation)
    if (upperZero && g[5] === 0xffff) return classifyIpv4(embeddedV4);
    // 64:ff9b::/96 NAT64
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0)) return classifyIpv4(embeddedV4);
    // fe80::/10 link-local, fec0::/10 site-local, ff00::/8 multicast
    if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00) {
      return 'always_blocked';
    }
    // fc00::/7 unique local
    if ((g[0] & 0xfe00) === 0xfc00) return 'private_lan';
    return 'public';
  }

  return 'always_blocked';
}

async function validateTargetHost(
  host: string,
  extraEnvKey?: string
): Promise<{ok: true; resolvedIp: string} | {ok: false; code: string; message: string}> {
  const cleanHost = host.trim().toLowerCase();
  if (!cleanHost || cleanHost.length > 253 || /[\s/@?#\\]/.test(cleanHost)) {
    return {
      ok: false,
      code: 'INVALID_HOST',
      message: 'Ungültiger Server-Hostname oder ungültige IP-Adresse.',
    };
  }

  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost === 'metadata.google.internal' ||
    cleanHost === 'metadata'
  ) {
    return {
      ok: false,
      code: 'BLOCKED_HOST',
      message: 'Loopback- und Cloud-Metadaten-Adressen sind über den Server-Proxy aus Sicherheitsgründen blockiert.',
    };
  }

  const allowedHosts = getAllowedHosts(extraEnvKey);
  const isExplicitlyAllowed = allowedHosts.has(cleanHost);

  if (net.isIP(cleanHost)) {
    const classification = classifyIpAddress(cleanHost);
    if (classification === 'always_blocked') {
      return {
        ok: false,
        code: 'BLOCKED_HOST',
        message: 'Diese Zieladresse (Loopback/Link-Local) ist aus Sicherheitsgründen nicht erlaubt.',
      };
    }
    if (classification === 'private_lan' && !isExplicitlyAllowed) {
      return {
        ok: false,
        code: 'PRIVATE_LAN_PROXY_BLOCKED',
        message:
          'Lokale LAN-IPs sind über den Cloud-Proxy gesperrt. Nutze im Heimnetz den Modus „Direktverbindung (LAN)“ oder trage den Host in FHEM_ALLOWED_HOSTS auf einem lokalen Proxy-Server ein.',
      };
    }
    return {ok: true, resolvedIp: cleanHost};
  }

  try {
    const records = await dns.lookup(cleanHost, {all: true});
    if (!records.length) {
      return {
        ok: false,
        code: 'DNS_ERROR',
        message: `Hostname „${cleanHost}“ konnte nicht aufgelöst werden.`,
      };
    }

    for (const record of records) {
      const classification = classifyIpAddress(record.address);
      if (classification === 'always_blocked') {
        return {
          ok: false,
          code: 'BLOCKED_HOST',
          message: 'Die aufgelöste Zieladresse ist aus Sicherheitsgründen blockiert.',
        };
      }
      if (classification === 'private_lan' && !isExplicitlyAllowed) {
        return {
          ok: false,
          code: 'PRIVATE_LAN_PROXY_BLOCKED',
          message:
            'Hostname löst auf eine private LAN-Adresse auf. Bitte „Direktverbindung (LAN)“ verwenden oder den Host in FHEM_ALLOWED_HOSTS freigeben.',
        };
      }
    }

    return {ok: true, resolvedIp: records[0].address};
  } catch {
    return {
      ok: false,
      code: 'DNS_ERROR',
      message: `Server „${cleanHost}“ nicht erreichbar (DNS-Auflösung fehlgeschlagen).`,
    };
  }
}

// Forces the socket to connect to the IP that passed validation (prevents DNS rebinding / TOCTOU).
function pinnedLookup(ip: string): net.LookupFunction {
  const family = net.isIPv6(ip) ? 6 : 4;
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{address: ip, family}]);
    } else {
      callback(null, ip, family);
    }
  };
}

function executeFhemHttpRequest(options: {
  protocol: 'http' | 'https';
  host: string;
  port: number;
  method: 'GET' | 'POST';
  pathWithQuery: string;
  bodyPayload?: string;
  contentType?: string;
  headers: Record<string, string>;
  acceptSelfSigned: boolean;
  timeoutMs: number;
  pinnedIp: string;
}): Promise<{
  statusCode: number;
  body: string;
  csrfTokenHeader?: string;
  contentType?: string;
  locationHeader?: string;
  latencyMs: number;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const isHttps = options.protocol === 'https';

    const reqHeaders: Record<string, string> = {...options.headers};
    let payloadBuf: Buffer | undefined;
    if (options.method === 'POST' && options.bodyPayload !== undefined) {
      payloadBuf = Buffer.from(options.bodyPayload, 'utf8');
      reqHeaders['Content-Type'] = options.contentType || 'application/x-www-form-urlencoded';
      reqHeaders['Content-Length'] = String(payloadBuf.byteLength);
    }

    const reqOptions: https.RequestOptions = {
      protocol: `${options.protocol}:`,
      hostname: options.host,
      port: options.port,
      path: options.pathWithQuery,
      method: options.method,
      headers: reqHeaders,
      timeout: options.timeoutMs,
      lookup: pinnedLookup(options.pinnedIp),
      ...(isHttps
        ? {
            rejectUnauthorized: !options.acceptSelfSigned,
          }
        : {}),
    };

    const transport = isHttps ? https : http;
    const req = transport.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const latencyMs = Date.now() - startedAt;
        const body = Buffer.concat(chunks).toString('utf8');
        const rawCsrf = res.headers['x-fhem-csrftoken'];
        const csrfTokenHeader = Array.isArray(rawCsrf) ? rawCsrf[0] : rawCsrf;
        const rawCt = res.headers['content-type'];
        const contentType = Array.isArray(rawCt) ? rawCt[0] : rawCt;
        const rawLoc = res.headers['location'];
        const locationHeader = Array.isArray(rawLoc) ? rawLoc[0] : rawLoc;
        resolve({
          statusCode: res.statusCode || 0,
          body,
          csrfTokenHeader,
          contentType,
          locationHeader,
          latencyMs,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(Object.assign(new Error('REQUEST_TIMEOUT'), {code: 'ETIMEDOUT'}));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (payloadBuf) {
      req.write(payloadBuf);
    }
    req.end();
  });
}

function tcpPing(host: string, port: number, timeoutMs: number): Promise<{ok: boolean; latencyMs: number}> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.connect({host, port});
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ok, latencyMs: Date.now() - startedAt});
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

const MAX_LONGPOLL_LINE_BYTES = 256 * 1024; // 256 KB safety cap per buffered line
const MAX_LONGPOLL_DURATION_MS = 10 * 60 * 1000; // 10 min max lifetime before clean reconnect
const LONGPOLL_HEARTBEAT_MS = 20_000;

interface ValidatedFhemConnection {
  protocol: 'http' | 'https';
  host: string;
  resolvedIp: string;
  port: number;
  basePath: string;
  httpMethod: 'GET' | 'POST';
  csrfMode: 'none' | 'auto' | 'manual';
  manualCsrfToken: string;
  timeoutMs: number;
  acceptSelfSigned: boolean;
  authType: string;
  queryTokenPair: [string, string] | null;
  headers: Record<string, string>;
}

async function parseAndValidateFhemConnection(
  body: FhemExecuteBody
): Promise<{ok: true; conn: ValidatedFhemConnection} | {ok: false; status: number; errorCode: string; message: string}> {
  const protocol = body.protocol === 'https' ? 'https' : body.protocol === 'http' ? 'http' : null;
  if (!protocol) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_PROTOCOL',
      message: 'Nur die Protokolle HTTP und HTTPS werden unterstützt.',
    };
  }

  const host = typeof body.host === 'string' ? body.host.trim() : '';
  const hostCheck = await validateTargetHost(host);
  if (!hostCheck.ok) {
    return {
      ok: false,
      status: 400,
      errorCode: hostCheck.code,
      message: hostCheck.message,
    };
  }

  const port = Number(body.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_PORT',
      message: 'Port muss eine Ganzzahl zwischen 1 und 65535 sein.',
    };
  }

  const basePath = typeof body.basePath === 'string' && body.basePath.trim() ? body.basePath.trim() : '/fhem';
  if (!/^\/[a-zA-Z0-9._/-]*$/.test(basePath)) {
    return {
      ok: false,
      status: 400,
      errorCode: 'INVALID_PATH',
      message: 'Ungültiger FHEMWEB-Pfad (Standard: /fhem).',
    };
  }

  const httpMethod: 'GET' | 'POST' = body.httpMethod === 'POST' ? 'POST' : 'GET';
  const csrfMode: 'none' | 'auto' | 'manual' =
    body.csrfMode === 'manual' ? 'manual' : body.csrfMode === 'auto' ? 'auto' : 'none';
  const rawCsrfToken = typeof body.csrfToken === 'string' ? body.csrfToken.trim() : '';
  const manualCsrfToken =
    csrfMode === 'manual' && rawCsrfToken && rawCsrfToken !== 'csrf_8472910482' ? rawCsrfToken : '';
  const timeoutMs = Math.min(30000, Math.max(1000, Number(body.timeoutMs) || 8000));
  const acceptSelfSigned = Boolean(body.acceptSelfSigned) && protocol === 'https';

  const authType = body.authType || (body.apiKey ? 'apikey' : body.username ? 'basic' : 'none');
  let queryTokenPair: [string, string] | null = null;
  if (authType === 'query_token') {
    const paramName = typeof body.queryTokenParam === 'string' ? body.queryTokenParam.trim() : '';
    const paramVal = typeof body.queryTokenValue === 'string' ? body.queryTokenValue.trim() : '';
    if (!paramName || !/^[A-Za-z0-9_.-]{1,64}$/.test(paramName)) {
      return {
        ok: false,
        status: 400,
        errorCode: 'INVALID_QUERY_PARAM',
        message: 'Ungültiger Query-Parameter-Name (nur Buchstaben, Zahlen, _, -, . erlaubt).',
      };
    }
    if (paramVal) {
      queryTokenPair = [paramName, paramVal];
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'FHEM-Control-Desk/1.0',
  };

  if (authType === 'apikey' && typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const cleanKey = body.apiKey.trim();
    if (/[\r\n]/.test(cleanKey)) {
      return {ok: false, status: 400, errorCode: 'INVALID_HEADER', message: 'Ungültige Zeichen im API-Key.'};
    }
    headers.Authorization = `Bearer ${cleanKey}`;
  } else if (authType === 'basic' && typeof body.username === 'string' && body.username.trim()) {
    const pass = typeof body.password === 'string' ? body.password : '';
    const encoded = Buffer.from(`${body.username.trim()}:${pass}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  } else if (authType === 'custom_header') {
    const hName = typeof body.customHeaderName === 'string' ? body.customHeaderName.trim() : '';
    const hVal = typeof body.customHeaderValue === 'string' ? body.customHeaderValue.trim() : '';
    if (hName) {
      if (!/^[A-Za-z0-9-]{1,64}$/.test(hName) || BLOCKED_CUSTOM_HEADERS.has(hName.toLowerCase())) {
        return {
          ok: false,
          status: 400,
          errorCode: 'INVALID_HEADER',
          message: `Header-Name „${hName}“ ist nicht zulässig.`,
        };
      }
      if (/[\r\n]/.test(hVal)) {
        return {
          ok: false,
          status: 400,
          errorCode: 'INVALID_HEADER',
          message: 'Ungültige Zeilenumbrüche im Header-Wert.',
        };
      }
      if (hVal) {
        headers[hName] = hVal;
      }
    }
  }

  return {
    ok: true,
    conn: {
      protocol,
      host,
      resolvedIp: hostCheck.resolvedIp,
      port,
      basePath,
      httpMethod,
      csrfMode,
      manualCsrfToken,
      timeoutMs,
      acceptSelfSigned,
      authType,
      queryTokenPair,
      headers,
    },
  };
}

function isValidFhemCsrfToken(token: string): boolean {
  const trimmed = token.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 128 &&
    trimmed.toLowerCase() !== 'none' &&
    !/[\r\n\s]/.test(trimmed)
  );
}

async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit: '1mb'}));

  // Request logging for /api/* (method, path, status, duration, errorCode only - never bodies/queries)
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/health') {
      next();
      return;
    }
    const startedAt = Date.now();
    const origJson = res.json.bind(res);
    res.json = ((payload: unknown) => {
      const p = payload as {ok?: boolean; errorCode?: string} | null;
      if (p && typeof p === 'object' && p.ok === false && p.errorCode) {
        res.locals.errorCode = p.errorCode;
      }
      return origJson(payload);
    }) as typeof res.json;
    res.on('finish', () => {
      const errorCode = res.locals.errorCode as string | undefined;
      log(errorCode ? 'warn' : 'info', 'http_request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - startedAt,
        errorCode,
      });
    });
    next();
  });

  // Liveness by default (used by Docker HEALTHCHECK). ?deep=1 additionally pings FHEM via TCP
  // when FHEM_HEALTH_HOST (and optionally FHEM_HEALTH_PORT, default 8083) is configured.
  app.get('/api/health', async (req, res) => {
    const payload: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    };
    const deep = String(req.query.deep || '').toLowerCase();
    if (deep === '1' || deep === 'true') {
      const fhemHost = (process.env.FHEM_HEALTH_HOST || '').trim();
      if (!fhemHost) {
        payload.fhem = {configured: false};
      } else {
        const fhemPort = Number(process.env.FHEM_HEALTH_PORT) || 8083;
        const result = await tcpPing(fhemHost, fhemPort, 2000);
        payload.fhem = {configured: true, ok: result.ok, latencyMs: result.latencyMs};
        if (!result.ok) {
          payload.status = 'degraded';
          log('warn', 'health_fhem_unreachable', {port: fhemPort});
        }
      }
    }
    res.json(payload);
  });

  app.post('/api/fhem/execute', async (req, res) => {
    if (req.get('X-Requested-With') !== 'FHEM-Control-Desk') {
      res.status(403).json({
        ok: false,
        errorCode: 'CSRF_HEADER_MISSING',
        message: 'Ungültige Anfrage-Herkunft (Header fehlt).',
      });
      return;
    }

    const body = (req.body || {}) as FhemExecuteBody;
    const validated = await parseAndValidateFhemConnection(body);
    if (!validated.ok) {
      res.status(validated.status).json({
        ok: false,
        errorCode: validated.errorCode,
        message: validated.message,
      });
      return;
    }

    const cmd = typeof body.cmd === 'string' ? body.cmd.trim() : '';
    if (!cmd || cmd.length > 4000) {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_CMD',
        message: 'FHEM-Befehl fehlt oder überschreitet die maximale Länge.',
      });
      return;
    }

    const {
      protocol,
      host,
      resolvedIp,
      port,
      basePath,
      httpMethod,
      csrfMode,
      manualCsrfToken,
      timeoutMs,
      acceptSelfSigned,
      authType,
      queryTokenPair,
      headers,
    } = validated.conn;

    const buildParamsString = (token: string) => {
      const queryParts = [`cmd=${encodeURIComponent(cmd)}`, 'XHR=1'];
      if (token) {
        queryParts.push(`fwcsrf=${encodeURIComponent(token)}`);
      }
      if (queryTokenPair) {
        queryParts.push(`${encodeURIComponent(queryTokenPair[0])}=${encodeURIComponent(queryTokenPair[1])}`);
      }
      return queryParts.join('&');
    };

    const sendWithToken = (token: string) => {
      const paramsStr = buildParamsString(token);
      return executeFhemHttpRequest({
        protocol,
        host,
        port,
        method: httpMethod,
        pathWithQuery: httpMethod === 'POST' ? basePath : `${basePath}?${paramsStr}`,
        bodyPayload: httpMethod === 'POST' ? paramsStr : undefined,
        headers,
        acceptSelfSigned,
        timeoutMs,
        pinnedIp: resolvedIp,
      });
    };

    try {
      let result = await sendWithToken(manualCsrfToken);

      const rawAutoToken = (result.csrfTokenHeader || '').trim();
      const isValidAutoToken = isValidFhemCsrfToken(rawAutoToken);

      // In 'auto' CSRF mode, transparently retry once if FHEMWEB returns X-FHEM-csrfToken on 400/403
      if (csrfMode === 'auto' && (result.statusCode === 400 || result.statusCode === 403)) {
        let retryToken = isValidAutoToken ? rawAutoToken : '';
        // If POST or initial call did not return X-FHEM-csrfToken, probe GET basePath?XHR=1 once
        if (!retryToken) {
          const probe = await executeFhemHttpRequest({
            protocol,
            host,
            port,
            method: 'GET',
            pathWithQuery: `${basePath}?XHR=1`,
            headers,
            acceptSelfSigned,
            timeoutMs: Math.min(timeoutMs, 5000),
            pinnedIp: resolvedIp,
          });
          const probeTok = (probe.csrfTokenHeader || '').trim();
          if (isValidFhemCsrfToken(probeTok)) {
            retryToken = probeTok;
          }
        }
        if (retryToken) {
          const retryResult = await sendWithToken(retryToken);
          result = {
            ...retryResult,
            latencyMs: result.latencyMs + retryResult.latencyMs,
          };
        }
      }

      if (result.statusCode === 401) {
        res.status(200).json({
          ok: false,
          statusCode: 401,
          latencyMs: result.latencyMs,
          errorCode: 'AUTH_FAILED',
          message: 'Authentifizierung fehlgeschlagen (HTTP 401).',
          diagnosticHint:
            authType === 'basic'
              ? 'Benutzername oder Passwort für HTTP Basic Auth wurden abgelehnt. Prüfe dein FHEM allowed-Device (basicAuth) oder Reverse-Proxy-Passwort.'
              : 'Der Server verlangt Zugangsdaten (HTTP 401). Wähle im Setup die passende Authentifizierung (z. B. HTTP Basic Auth oder API-Key).',
        });
        return;
      }

      if (result.statusCode === 301 || result.statusCode === 302 || result.statusCode === 307 || result.statusCode === 308) {
        res.status(200).json({
          ok: false,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          errorCode: 'REDIRECT',
          message: `Server leitete weiter (HTTP ${result.statusCode}).`,
          diagnosticHint: result.locationHeader
            ? `Weiterleitung auf „${result.locationHeader.slice(0, 120)}“. Prüfe Protokoll (HTTP vs. HTTPS) und Basispfad (z. B. /fhem).`
            : 'Prüfe Protokoll (HTTP vs. HTTPS) und Basispfad (z. B. /fhem).',
        });
        return;
      }

      if (result.statusCode === 400 || result.statusCode === 403) {
        const serverRequiresCsrf = isValidAutoToken;
        res.status(200).json({
          ok: false,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          csrfTokenHeader: serverRequiresCsrf ? rawAutoToken : undefined,
          errorCode: serverRequiresCsrf ? 'CSRF_REQUIRED' : 'ACCESS_DENIED',
          message: serverRequiresCsrf
            ? `FHEMWEB verlangt ein CSRF-Token (HTTP ${result.statusCode}).`
            : `FHEMWEB / Proxy hat die Anfrage abgelehnt (HTTP ${result.statusCode}).`,
          diagnosticHint: serverRequiresCsrf
            ? 'Dein FHEM-Server hat den CSRF-Schutz aktiv (Header X-FHEM-csrfToken erkannt). Stelle unten den CSRF-Modus auf „Automatisch erkennen“ oder „Manuell“ um — oder setze in FHEM „attr WEB csrfToken none“.'
            : 'Prüfe Authentifizierung, FHEM allowed-Berechtigungen (allowedCommands) oder Reverse-Proxy-Regeln.',
        });
        return;
      }

      if (result.statusCode === 404) {
        res.status(200).json({
          ok: false,
          statusCode: 404,
          latencyMs: result.latencyMs,
          errorCode: 'NOT_FOUND',
          message: `Endpunkt „${basePath}“ nicht gefunden (HTTP 404).`,
          diagnosticHint: 'Prüfe den Basispfad (Standard ist /fhem, bei manchen Proxys / oder ein eigener Subpfad).',
        });
        return;
      }

      if (result.statusCode >= 400) {
        res.status(200).json({
          ok: false,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          errorCode: 'HTTP_ERROR',
          message: `FHEM-Server antwortete mit HTTP-Status ${result.statusCode}.`,
          data: result.body,
        });
        return;
      }

      res.json({
        ok: true,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        csrfTokenHeader: isValidAutoToken ? rawAutoToken : undefined,
        data: result.body,
      });
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & {message?: string};
      const code = error.code || '';

      if (code === 'ETIMEDOUT' || error.message === 'REQUEST_TIMEOUT') {
        res.status(200).json({
          ok: false,
          errorCode: 'TIMEOUT',
          message: `Zeitüberschreitung nach ${timeoutMs} ms. FHEM-Server reagiert nicht.`,
        });
        return;
      }

      if (
        code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
        code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
        code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        code === 'CERT_HAS_EXPIRED' ||
        code === 'ERR_TLS_CERT_ALTNAME_INVALID'
      ) {
        res.status(200).json({
          ok: false,
          errorCode: 'TLS_ERROR',
          message:
            'SSL/TLS-Zertifikat nicht vertrauenswürdig (Self-Signed). Aktiviere in den Einstellungen „Self-Signed Zertifikate akzeptieren“.',
        });
        return;
      }

      if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
        res.status(200).json({
          ok: false,
          errorCode: 'UNREACHABLE',
          message: `Verbindung zu ${host}:${port} abgelehnt oder Server nicht erreichbar.`,
        });
        return;
      }

      if (error.message === 'RESPONSE_TOO_LARGE') {
        res.status(200).json({
          ok: false,
          errorCode: 'RESPONSE_TOO_LARGE',
          message: 'Antwort des FHEM-Servers überschreitet das 8-MB-Limit.',
        });
        return;
      }

      log('error', 'fhem_execute_network_error', {code});
      res.status(200).json({
        ok: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Netzwerkfehler bei der Kommunikation mit dem FHEM-Server.',
      });
    }
  });

  // Real-Time FHEMWEB Longpoll Proxy (streams FHEM inform events as Server-Sent Events)
  app.post('/api/fhem/longpoll', async (req, res) => {
    if (req.get('X-Requested-With') !== 'FHEM-Control-Desk') {
      res.status(403).json({
        ok: false,
        errorCode: 'CSRF_HEADER_MISSING',
        message: 'Ungültige Anfrage-Herkunft (Header fehlt).',
      });
      return;
    }

    const body = (req.body || {}) as FhemExecuteBody;
    const validated = await parseAndValidateFhemConnection(body);
    if (!validated.ok) {
      res.status(validated.status).json({
        ok: false,
        errorCode: validated.errorCode,
        message: validated.message,
      });
      return;
    }

    const {
      protocol,
      host,
      resolvedIp,
      port,
      basePath,
      csrfMode,
      manualCsrfToken,
      timeoutMs,
      acceptSelfSigned,
      queryTokenPair,
      headers,
    } = validated.conn;

    let effectiveCsrf = manualCsrfToken;
    // In 'auto' CSRF mode, optionally probe once to discover X-FHEM-csrfToken cleanly
    if (csrfMode === 'auto' && !effectiveCsrf) {
      try {
        const probe = await executeFhemHttpRequest({
          protocol,
          host,
          port,
          method: 'GET',
          pathWithQuery: `${basePath}?XHR=1`,
          headers,
          acceptSelfSigned,
          timeoutMs: Math.min(timeoutMs, 5000),
          pinnedIp: resolvedIp,
        });
        if (probe.csrfTokenHeader && isValidFhemCsrfToken(probe.csrfTokenHeader)) {
          effectiveCsrf = probe.csrfTokenHeader.trim();
        }
      } catch {
        // Proceed and let primary longpoll connection report exact error
      }
    }

    const buildLongpollPath = (token: string) => {
      const queryParts = [
        'XHR=1',
        'inform=type=status;filter=.*;since=null;fmt=JSON',
        `timestamp=${Date.now()}`,
      ];
      if (token) {
        queryParts.push(`fwcsrf=${encodeURIComponent(token)}`);
      }
      if (queryTokenPair) {
        queryParts.push(`${encodeURIComponent(queryTokenPair[0])}=${encodeURIComponent(queryTokenPair[1])}`);
      }
      return `${basePath}?${queryParts.join('&')}`;
    };

    const isHttps = protocol === 'https';
    const transport = isHttps ? https : http;
    let activeUpstreamReq: http.ClientRequest | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let maxLifetimeTimer: ReturnType<typeof setTimeout> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let sseStarted = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (maxLifetimeTimer) clearTimeout(maxLifetimeTimer);
      if (connectTimer) clearTimeout(connectTimer);
      heartbeatTimer = null;
      maxLifetimeTimer = null;
      connectTimer = null;
      if (activeUpstreamReq) {
        try {
          activeUpstreamReq.destroy();
        } catch {
          // ignore
        }
        activeUpstreamReq = null;
      }
    };

    const sendSse = (event: string, data: unknown) => {
      if (closed || res.writableEnded) return;
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        res.write(`event: ${event}\ndata: ${payload}\n\n`);
      } catch {
        cleanup();
      }
    };

    req.on('close', cleanup);
    res.on('close', cleanup);

    const openUpstream = (token: string, allowCsrfRetry: boolean) => {
      if (closed) return;

      const reqOptions: https.RequestOptions = {
        protocol: `${protocol}:`,
        hostname: host,
        port,
        path: buildLongpollPath(token),
        method: 'GET',
        headers: {
          ...headers,
          Accept: 'text/plain, application/json, */*',
          Connection: 'keep-alive',
        },
        lookup: pinnedLookup(resolvedIp),
        ...(isHttps ? {rejectUnauthorized: !acceptSelfSigned} : {}),
      };

      const upstreamReq = transport.request(reqOptions, (upstreamRes) => {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        if (closed) {
          upstreamRes.destroy();
          return;
        }

        const statusCode = upstreamRes.statusCode || 0;
        const rawCsrf = upstreamRes.headers['x-fhem-csrftoken'];
        const headerCsrf = (Array.isArray(rawCsrf) ? rawCsrf[0] : rawCsrf || '').trim();

        // Retry once with discovered CSRF token if needed
        if (
          allowCsrfRetry &&
          csrfMode === 'auto' &&
          (statusCode === 400 || statusCode === 403) &&
          isValidFhemCsrfToken(headerCsrf)
        ) {
          upstreamRes.resume();
          openUpstream(headerCsrf, false);
          return;
        }

        if (statusCode === 401) {
          upstreamRes.resume();
          cleanup();
          if (!res.headersSent) {
            res.status(200).json({
              ok: false,
              statusCode: 401,
              errorCode: 'AUTH_FAILED',
              message: 'Longpoll-Authentifizierung fehlgeschlagen (HTTP 401).',
            });
          }
          return;
        }

        if (statusCode === 400 || statusCode === 403) {
          upstreamRes.resume();
          cleanup();
          if (!res.headersSent) {
            res.status(200).json({
              ok: false,
              statusCode,
              errorCode: isValidFhemCsrfToken(headerCsrf) ? 'CSRF_REQUIRED' : 'ACCESS_DENIED',
              message: `FHEMWEB hat Longpoll abgelehnt (HTTP ${statusCode}).`,
            });
          }
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          upstreamRes.resume();
          cleanup();
          if (!res.headersSent) {
            res.status(200).json({
              ok: false,
              statusCode,
              errorCode: 'HTTP_ERROR',
              message: `FHEMWEB Longpoll antwortete mit HTTP ${statusCode}.`,
            });
          }
          return;
        }

        // Start SSE stream to browser
        sseStarted = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        sendSse('connected', {ts: Date.now()});

        heartbeatTimer = setInterval(() => {
          sendSse('ping', {ts: Date.now()});
        }, LONGPOLL_HEARTBEAT_MS);

        maxLifetimeTimer = setTimeout(() => {
          sendSse('reconnect', {reason: 'max_lifetime'});
          cleanup();
          if (!res.writableEnded) res.end();
        }, MAX_LONGPOLL_DURATION_MS);

        let buffer = '';
        upstreamRes.setEncoding('utf8');
        upstreamRes.on('data', (chunk: string) => {
          if (closed) return;
          buffer += chunk;
          if (buffer.length > MAX_LONGPOLL_LINE_BYTES) {
            const lastNl = buffer.lastIndexOf('\n');
            buffer = lastNl >= 0 ? buffer.slice(lastNl + 1) : '';
            if (buffer.length > MAX_LONGPOLL_LINE_BYTES) {
              buffer = '';
            }
          }

          let nlIdx = buffer.indexOf('\n');
          while (nlIdx !== -1) {
            const line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);
            if (line) {
              sendSse('update', {line});
            }
            nlIdx = buffer.indexOf('\n');
          }
        });

        upstreamRes.on('end', () => {
          if (!closed) {
            const remaining = buffer.trim();
            if (remaining) {
              sendSse('update', {line: remaining});
            }
            sendSse('reconnect', {reason: 'upstream_closed'});
            cleanup();
            if (!res.writableEnded) res.end();
          }
        });

        upstreamRes.on('error', () => {
          if (!closed) {
            sendSse('error', {errorCode: 'STREAM_ERROR', message: 'Longpoll-Verbindung unterbrochen.'});
            cleanup();
            if (!res.writableEnded) res.end();
          }
        });
      });

      activeUpstreamReq = upstreamReq;

      connectTimer = setTimeout(() => {
        if (!sseStarted && !closed) {
          cleanup();
          if (!res.headersSent) {
            res.status(200).json({
              ok: false,
              errorCode: 'TIMEOUT',
              message: `Longpoll-Verbindungsaufbau überschritt ${timeoutMs} ms.`,
            });
          }
        }
      }, timeoutMs);

      upstreamReq.on('error', (err: NodeJS.ErrnoException) => {
        if (closed) return;
        const code = err.code || '';
        const isTls =
          code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          code === 'CERT_HAS_EXPIRED' ||
          code === 'ERR_TLS_CERT_ALTNAME_INVALID';

        if (!sseStarted && !res.headersSent) {
          cleanup();
          res.status(200).json({
            ok: false,
            errorCode: isTls ? 'TLS_ERROR' : 'UNREACHABLE',
            message: isTls
              ? 'SSL/TLS-Zertifikat für Longpoll nicht vertrauenswürdig.'
              : `Longpoll-Verbindung zu ${host}:${port} fehlgeschlagen.`,
          });
        } else {
          sendSse('error', {errorCode: 'STREAM_ERROR', message: 'Longpoll-Verbindung abgebrochen.'});
          cleanup();
          if (!res.writableEnded) res.end();
        }
      });

      upstreamReq.end();
    };

    openUpstream(effectiveCsrf, true);
  });

  // OpenAI-compatible AI Assistant Proxy (avoids browser CORS issues, never logs keys)
  app.post('/api/ai/chat', async (req, res) => {
    if (req.get('X-Requested-With') !== 'FHEM-Control-Desk') {
      res.status(403).json({
        ok: false,
        errorCode: 'CSRF_HEADER_MISSING',
        message: 'Ungültige Anfrage-Herkunft (Header fehlt).',
      });
      return;
    }

    const body = (req.body || {}) as {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      messages?: Array<{role: string; content: string}>;
      temperature?: number;
      timeoutMs?: number;
    };

    const envBaseUrl = (process.env.AI_BASE_URL || '').trim();
    const bodyBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const rawBaseUrl = bodyBaseUrl || envBaseUrl;
    const bodyApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const model =
      (typeof body.model === 'string' && body.model.trim()) ||
      (process.env.AI_MODEL || '').trim();

    if (!rawBaseUrl) {
      res.status(400).json({
        ok: false,
        errorCode: 'MISSING_BASE_URL',
        message: 'Bitte eine OpenAI-kompatible Basis-URL angeben (z. B. https://api.openai.com/v1).',
      });
      return;
    }

    if (!model) {
      res.status(400).json({
        ok: false,
        errorCode: 'MISSING_MODEL',
        message: 'Bitte einen Modellnamen angeben (z. B. gpt-4o-mini, llama-3.3-70b-versatile).',
      });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawBaseUrl);
    } catch {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_URL',
        message: 'Ungültige API-Basis-URL. Bitte vollständige URL inklusive https:// angeben.',
      });
      return;
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_PROTOCOL',
        message: 'Es werden nur HTTP- und HTTPS-Endpunkte unterstützt.',
      });
      return;
    }

    // The server-side AI_API_KEY is only ever sent to the origin configured in AI_BASE_URL.
    let envKeyAllowed = false;
    if (envBaseUrl) {
      try {
        envKeyAllowed = new URL(envBaseUrl).origin === parsedUrl.origin;
      } catch {
        envKeyAllowed = false;
      }
    }
    const apiKey = bodyApiKey || (envKeyAllowed ? (process.env.AI_API_KEY || '').trim() : '');

    const targetHostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    const hostCheck = await validateTargetHost(targetHostname, 'AI_ALLOWED_HOSTS');
    if (!hostCheck.ok) {
      res.status(400).json({
        ok: false,
        errorCode: hostCheck.code,
        message:
          hostCheck.code === 'PRIVATE_LAN_PROXY_BLOCKED' || hostCheck.code === 'BLOCKED_HOST'
            ? 'Lokale Adressen (z. B. Ollama/LM Studio im LAN) sind über den Server-Proxy gesperrt. Schalte in den KI-Einstellungen auf „Direktverbindung (LAN)“ um oder gib den Host über AI_ALLOWED_HOSTS frei.'
            : hostCheck.message,
      });
      return;
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_MESSAGES',
        message: 'Keine Chat-Nachrichten übermittelt.',
      });
      return;
    }

    const sanitizedMessages = body.messages
      .filter(
        (m) =>
          m &&
          typeof m.content === 'string' &&
          (m.role === 'system' || m.role === 'user' || m.role === 'assistant')
      )
      .slice(-24)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 32000),
      }));

    if (sanitizedMessages.length === 0) {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_MESSAGES',
        message: 'Ungültiges Nachrichtenformat.',
      });
      return;
    }

    // Build /chat/completions endpoint cleanly without duplicating the suffix
    let endpointPath = parsedUrl.pathname.replace(/\/+$/, '');
    if (!endpointPath.endsWith('/chat/completions')) {
      endpointPath = `${endpointPath}/chat/completions`;
    }
    const isHttpsTarget = parsedUrl.protocol === 'https:';
    const targetPort = parsedUrl.port ? Number(parsedUrl.port) : isHttpsTarget ? 443 : 80;

    const timeoutMs = Math.min(60000, Math.max(5000, Number(body.timeoutMs) || 45000));
    const temperature =
      typeof body.temperature === 'number' && Number.isFinite(body.temperature)
        ? Math.max(0, Math.min(1.5, body.temperature))
        : 0.2;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'FHEM-Control-Desk/1.0',
      };
      if (apiKey && !/[\r\n]/.test(apiKey)) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      // Pinned to the validated IP; redirects are intentionally not followed.
      const upstream = await executeFhemHttpRequest({
        protocol: isHttpsTarget ? 'https' : 'http',
        host: targetHostname,
        port: targetPort,
        method: 'POST',
        pathWithQuery: `${endpointPath}${parsedUrl.search}`,
        bodyPayload: JSON.stringify({
          model,
          messages: sanitizedMessages,
          temperature,
        }),
        contentType: 'application/json',
        headers,
        acceptSelfSigned: false,
        timeoutMs,
        pinnedIp: hostCheck.resolvedIp,
      });

      const latencyMs = upstream.latencyMs;
      const upstreamOk = upstream.statusCode >= 200 && upstream.statusCode < 300;

      let parsed: {
        choices?: Array<{message?: {content?: string | Array<{type?: string; text?: string}>}}>;
        model?: string;
        usage?: {prompt_tokens?: number; completion_tokens?: number; total_tokens?: number};
        error?: {message?: string; type?: string; code?: string};
      } | null = null;
      try {
        parsed = JSON.parse(upstream.body);
      } catch {
        parsed = null;
      }

      if (!upstreamOk) {
        const providerMsg = parsed?.error?.message;
        let friendly = `KI-Endpunkt antwortete mit HTTP ${upstream.statusCode}.`;
        if (upstream.statusCode === 401) {
          friendly = 'API-Key ungültig oder nicht autorisiert (HTTP 401). Bitte Key prüfen.';
        } else if (upstream.statusCode === 403) {
          friendly = 'Zugriff vom KI-Anbieter verweigert (HTTP 403).';
        } else if (upstream.statusCode === 404) {
          friendly = `Endpunkt oder Modell „${model}“ nicht gefunden (HTTP 404). Basis-URL (meist mit /v1) prüfen.`;
        } else if (upstream.statusCode === 429) {
          friendly = 'Rate-Limit oder Kontingent beim KI-Anbieter überschritten (HTTP 429).';
        }
        res.status(200).json({
          ok: false,
          statusCode: upstream.statusCode,
          latencyMs,
          errorCode: `HTTP_${upstream.statusCode}`,
          message: providerMsg ? `${friendly} (${providerMsg.slice(0, 180)})` : friendly,
        });
        return;
      }

      const rawContent = parsed?.choices?.[0]?.message?.content;
      const content =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((part) => part.text || '').join('\n')
            : '';

      if (!content.trim()) {
        res.status(200).json({
          ok: false,
          statusCode: upstream.statusCode,
          latencyMs,
          errorCode: 'EMPTY_RESPONSE',
          message: 'Der KI-Endpunkt hat eine leere Antwort zurückgegeben.',
        });
        return;
      }

      res.json({
        ok: true,
        content,
        model: parsed?.model || model,
        usage: parsed?.usage || null,
        latencyMs,
      });
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & {message?: string};
      if (error.code === 'ETIMEDOUT' || error.message === 'REQUEST_TIMEOUT') {
        res.status(200).json({
          ok: false,
          errorCode: 'TIMEOUT',
          message: `Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s. KI-Endpunkt antwortet nicht.`,
        });
        return;
      }
      log('error', 'ai_chat_network_error', {code: error.code || ''});
      res.status(200).json({
        ok: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Verbindung zum OpenAI-kompatiblen Endpunkt fehlgeschlagen. URL und Netzwerk prüfen.',
      });
    }
  });

  const httpServer = http.createServer(app);
  let viteInstance: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const viteReady = import('vite')
      .then(({createServer: createViteServer}) =>
        createViteServer({
          server: {
            middlewareMode: true,
            hmr: hmrEnabled,
            ws: hmrEnabled ? {server: httpServer} : false,
          },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteInstance = vite;
        return vite;
      });

    viteReady.catch((err) => {
      log('error', 'vite_init_failed', {error: String(err)});
      process.exit(1);
    });

    // If a browser previously registered VitePWA's dev-sw.js, cleanly unregister it
    // instead of serving index.html (which causes a MIME/script error in SW updates).
    app.get('/dev-sw.js', (_req, res) => {
      res
        .setHeader('Cache-Control', 'no-store')
        .type('application/javascript')
        .send(
          'self.addEventListener("install", () => self.skipWaiting());\n' +
            'self.addEventListener("activate", (e) => e.waitUntil(self.registration.unregister()));\n'
        );
    });

    // In Vite 8 middlewareMode with DISABLE_HMR=true, /@vite/client still initializes a
    // WebSocket transport to port 24678. Swap in a no-op connected transport so neither
    // WebSocket errors nor SendBeforeConnectError occur.
    if (!hmrEnabled) {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const vite = await viteReady;
          const transformed = await vite.transformRequest('/@vite/client');
          if (!transformed?.code) {
            next();
            return;
          }
          const patched = transformed.code.replace(
            /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
            'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });'
          );
          res.type('application/javascript').send(patched);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use((req, res, next) => {
      viteReady
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.on('error', (err) => {
    log('error', 'http_server_failed', {error: String(err)});
    process.exit(1);
  });

  httpServer.listen(PORT, HOST, () => {
    log('info', 'server_started', {host: HOST, port: PORT, env: process.env.NODE_ENV || 'development'});
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', 'server_shutdown');
    const forceExit = setTimeout(() => process.exit(0), 2000);
    forceExit.unref();
    Promise.resolve(viteInstance?.close())
      .catch(() => {})
      .finally(() => {
        httpServer.close(() => process.exit(0));
      });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

createApp().catch((err) => {
  log('error', 'fatal_startup_error', {error: String(err)});
  process.exit(1);
});
