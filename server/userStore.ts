import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type UserRole = 'admin' | 'user';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

interface StoredUserRecord {
  id: string;
  username: string;
  usernameLower: string;
  displayName: string;
  role: UserRole;
  passwordSalt: string;
  passwordHash: string;
  vaultSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UsersFilePayload {
  version: 1;
  users: StoredUserRecord[];
}

interface EncryptedSecretBlob {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

interface StoredProfileFile {
  version: 1;
  userId: string;
  updatedAt: string;
  fhemConfigPublic: Record<string, unknown>;
  fhemSecretsEncrypted?: EncryptedSecretBlob | null;
  aiConfigPublic?: Record<string, unknown> | null;
  aiSecretsEncrypted?: EncryptedSecretBlob | null;
  preferences?: Record<string, unknown> | null;
  customMedia?: {
    rooms: Record<string, string>;
    devices: Record<string, string>;
    floorplan?: string;
  } | null;
}

export interface SyncedProfilePayload {
  config?: Record<string, unknown>;
  aiConfig?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  customMedia?: {
    rooms: Record<string, string>;
    devices: Record<string, string>;
    floorplan?: string;
  };
  updatedAt?: string;
}

interface ActiveSession {
  tokenHash: string;
  userId: string;
  role: UserRole;
  vaultKey: Buffer;
  expiresAt: number;
  rememberMe: boolean;
}

interface StoredPersistentSession {
  tokenHash: string;
  userId: string;
  role: UserRole;
  wrappedVaultKey: EncryptedSecretBlob;
  expiresAt: number;
}

interface SessionsFilePayload {
  version: 1;
  sessions: StoredPersistentSession[];
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (non-persistent browser session)
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (stay signed in)
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOGIN_MAX_FAILURES = 10;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

const FHEM_SECRET_KEYS = [
  'password',
  'apiKey',
  'customHeaderValue',
  'queryTokenValue',
  'csrfToken',
] as const;

const AI_SECRET_KEYS = ['apiKey'] as const;

function scryptHash(secret: string, saltHex: string, keyLen = 64): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, Buffer.from(saltHex, 'hex'), keyLen, {N: 16384, r: 8, p: 1}, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function encryptWithVaultKey(payload: Record<string, string>, vaultKey: Buffer): EncryptedSecretBlob {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function deriveSessionWrapKey(rawToken: string): Buffer {
  return crypto.createHash('sha256').update('fhem-session-wrap:v1:', 'utf8').update(rawToken, 'utf8').digest();
}

function wrapVaultKey(vaultKey: Buffer, rawToken: string): EncryptedSecretBlob {
  const wrapKey = deriveSessionWrapKey(rawToken);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, iv);
  const encrypted = Buffer.concat([cipher.update(vaultKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function unwrapVaultKey(blob: EncryptedSecretBlob | null | undefined, rawToken: string): Buffer | null {
  if (!blob || blob.v !== 1 || !blob.iv || !blob.tag || !blob.ciphertext) return null;
  try {
    const wrapKey = deriveSessionWrapKey(rawToken);
    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const ciphertext = Buffer.from(blob.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', wrapKey, iv);
    decipher.setAuthTag(tag);
    const key = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function decryptWithVaultKey(blob: EncryptedSecretBlob | null | undefined, vaultKey: Buffer): Record<string, string> {
  if (!blob || blob.v !== 1 || !blob.iv || !blob.tag || !blob.ciphertext) {
    return {};
  }
  try {
    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const ciphertext = Buffer.from(blob.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function isSafeImageSrc(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 2_000_000) return false;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('/')) {
    return true;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function sanitizeMediaMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 120) break;
    if (typeof k === 'string' && k.length > 0 && k.length <= 120 && isSafeImageSrc(v)) {
      out[k] = v.trim();
      count++;
    }
  }
  return out;
}

export class UserProfileStore {
  private readonly baseDir: string;
  private readonly profilesDir: string;
  private readonly usersFilePath: string;
  private readonly sessionsFilePath: string;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly loginAttempts = new Map<string, {count: number; resetAt: number}>();
  private writeLock: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.baseDir = path.resolve(dataDir);
    this.profilesDir = path.resolve(this.baseDir, 'profiles');
    this.usersFilePath = path.resolve(this.baseDir, 'users.json');
    this.sessionsFilePath = path.resolve(this.baseDir, 'sessions.json');
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.baseDir, {recursive: true, mode: 0o700});
    await fs.mkdir(this.profilesDir, {recursive: true, mode: 0o700});
  }

  private resolveProfilePath(userId: string): string {
    if (!UUID_RE.test(userId)) {
      throw new Error('INVALID_USER_ID');
    }
    const candidate = path.resolve(this.profilesDir, `${userId}.json`);
    if (!candidate.startsWith(this.profilesDir + path.sep)) {
      throw new Error('INVALID_PROFILE_PATH');
    }
    return candidate;
  }

  private async atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
    await this.ensureDirs();
    const tmpPath = `${targetPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const serialized = JSON.stringify(data, null, 2);
    await fs.writeFile(tmpPath, serialized, {encoding: 'utf8', mode: 0o600});
    await fs.rename(tmpPath, targetPath);
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLock;
    let release!: () => void;
    this.writeLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    return prev.then(fn).finally(() => release());
  }

  private async readUsersFile(): Promise<StoredUserRecord[]> {
    try {
      const raw = await fs.readFile(this.usersFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<UsersFilePayload>;
      if (parsed && Array.isArray(parsed.users)) {
        return parsed.users;
      }
      return [];
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeUsersFile(users: StoredUserRecord[]): Promise<void> {
    const payload: UsersFilePayload = {version: 1, users};
    await this.atomicWriteJson(this.usersFilePath, payload);
  }

  private toPublicUser(rec: StoredUserRecord): PublicUser {
    return {
      id: rec.id,
      username: rec.username,
      displayName: rec.displayName,
      role: rec.role,
      createdAt: rec.createdAt,
      lastLoginAt: rec.lastLoginAt,
    };
  }

  private async readSessionsFile(): Promise<StoredPersistentSession[]> {
    try {
      const raw = await fs.readFile(this.sessionsFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SessionsFilePayload>;
      if (parsed && Array.isArray(parsed.sessions)) {
        const now = Date.now();
        return parsed.sessions.filter(
          (s) => s && typeof s.tokenHash === 'string' && typeof s.expiresAt === 'number' && s.expiresAt > now
        );
      }
      return [];
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeSessionsFile(sessions: StoredPersistentSession[]): Promise<void> {
    const now = Date.now();
    const active = sessions.filter((s) => s.expiresAt > now).slice(-200);
    const payload: SessionsFilePayload = {version: 1, sessions: active};
    await this.atomicWriteJson(this.sessionsFilePath, payload);
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [hash, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(hash);
      }
    }
  }

  private async createSession(
    userId: string,
    role: UserRole,
    vaultKey: Buffer,
    rememberMe = false
  ): Promise<string> {
    this.pruneExpiredSessions();
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(rawToken);
    const ttl = rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
    const expiresAt = Date.now() + ttl;

    this.sessions.set(tokenHash, {
      tokenHash,
      userId,
      role,
      vaultKey,
      expiresAt,
      rememberMe,
    });

    if (rememberMe) {
      const persisted = await this.readSessionsFile();
      persisted.push({
        tokenHash,
        userId,
        role,
        wrappedVaultKey: wrapVaultKey(vaultKey, rawToken),
        expiresAt,
      });
      await this.writeSessionsFile(persisted);
    }

    return rawToken;
  }

  private async revokeUserSessions(userId: string, keepTokenHash?: string): Promise<void> {
    for (const [hash, session] of this.sessions.entries()) {
      if (session.userId === userId && hash !== keepTokenHash) {
        this.sessions.delete(hash);
      }
    }
    const persisted = await this.readSessionsFile();
    const remaining = persisted.filter((s) => s.userId !== userId || s.tokenHash === keepTokenHash);
    if (remaining.length !== persisted.length) {
      await this.writeSessionsFile(remaining);
    }
  }

  async getSessionFromToken(rawToken: string | null | undefined): Promise<{
    session: ActiveSession;
    user: PublicUser;
  } | null> {
    if (!rawToken || rawToken.length > 256) return null;
    const tokenHash = sha256Hex(rawToken);
    let session = this.sessions.get(tokenHash);

    if (!session) {
      // Attempt restore from persistent remember-me sessions (e.g. after server/container restart)
      const persisted = await this.readSessionsFile();
      const record = persisted.find((s) => s.tokenHash === tokenHash);
      if (!record || record.expiresAt <= Date.now()) {
        return null;
      }
      const unwrappedKey = unwrapVaultKey(record.wrappedVaultKey, rawToken);
      if (!unwrappedKey) {
        return null;
      }
      session = {
        tokenHash: record.tokenHash,
        userId: record.userId,
        role: record.role,
        vaultKey: unwrappedKey,
        expiresAt: record.expiresAt,
        rememberMe: true,
      };
      this.sessions.set(tokenHash, session);
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }

    const users = await this.readUsersFile();
    const found = users.find((u) => u.id === session.userId);
    if (!found) {
      this.sessions.delete(tokenHash);
      return null;
    }

    // Keep role synced and slide expiry
    session.role = found.role;
    const ttl = session.rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
    session.expiresAt = Date.now() + ttl;
    return {session, user: this.toPublicUser(found)};
  }

  async logoutToken(rawToken: string | null | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = sha256Hex(rawToken);
    this.sessions.delete(tokenHash);
    await this.withLock(async () => {
      const persisted = await this.readSessionsFile();
      const remaining = persisted.filter((s) => s.tokenHash !== tokenHash);
      if (remaining.length !== persisted.length) {
        await this.writeSessionsFile(remaining);
      }
    });
  }

  async getStatus(rawToken?: string | null): Promise<{
    initialized: boolean;
    userCount: number;
    authenticated: boolean;
    user: PublicUser | null;
  }> {
    const users = await this.readUsersFile();
    const auth = await this.getSessionFromToken(rawToken);
    return {
      initialized: users.length > 0,
      userCount: users.length,
      authenticated: Boolean(auth),
      user: auth ? auth.user : null,
    };
  }

  validateCredentialsInput(username: string, displayName: string, password: string): string | null {
    const cleanUser = username.trim();
    if (!USERNAME_RE.test(cleanUser)) {
      return 'Benutzername muss 3–32 Zeichen lang sein (Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich).';
    }
    const cleanDisplay = displayName.trim();
    if (cleanDisplay.length > 60) {
      return 'Anzeigename darf maximal 60 Zeichen lang sein.';
    }
    if (password.length < 8 || password.length > 128) {
      return 'Passwort muss zwischen 8 und 128 Zeichen lang sein.';
    }
    return null;
  }

  async bootstrapFirstAdmin(params: {
    username: string;
    displayName?: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<{ok: true; token: string; user: PublicUser; rememberMe: boolean} | {ok: false; status: number; errorCode: string; message: string}> {
    const cleanUser = params.username.trim();
    const cleanDisplay = (params.displayName || '').trim() || cleanUser;
    const rememberMe = params.rememberMe !== false;
    const err = this.validateCredentialsInput(cleanUser, cleanDisplay, params.password);
    if (err) {
      return {ok: false, status: 400, errorCode: 'VALIDATION_ERROR', message: err};
    }

    return this.withLock(async () => {
      const users = await this.readUsersFile();
      if (users.length > 0) {
        return {
          ok: false,
          status: 409,
          errorCode: 'ALREADY_INITIALIZED',
          message: 'Es existiert bereits ein Admin-Profil. Bitte melde dich normal an.',
        };
      }

      const passwordSalt = crypto.randomBytes(16).toString('hex');
      const vaultSalt = crypto.randomBytes(16).toString('hex');
      const passwordHash = (await scryptHash(params.password, passwordSalt, 64)).toString('hex');
      const vaultKey = await scryptHash(params.password, vaultSalt, 32);
      const nowIso = new Date().toISOString();

      const record: StoredUserRecord = {
        id: crypto.randomUUID(),
        username: cleanUser,
        usernameLower: cleanUser.toLowerCase(),
        displayName: cleanDisplay,
        role: 'admin',
        passwordSalt,
        passwordHash,
        vaultSalt,
        createdAt: nowIso,
        lastLoginAt: nowIso,
      };

      await this.writeUsersFile([record]);
      const token = await this.createSession(record.id, record.role, vaultKey, rememberMe);
      return {ok: true, token, user: this.toPublicUser(record), rememberMe};
    });
  }

  async login(params: {
    username: string;
    password: string;
    clientKey: string;
    rememberMe?: boolean;
  }): Promise<{ok: true; token: string; user: PublicUser; rememberMe: boolean} | {ok: false; status: number; errorCode: string; message: string}> {
    const cleanUser = params.username.trim();
    const rateKey = `${params.clientKey}:${cleanUser.toLowerCase()}`;
    const now = Date.now();
    const bucket = this.loginAttempts.get(rateKey);
    if (bucket && bucket.resetAt > now && bucket.count >= LOGIN_MAX_FAILURES) {
      return {
        ok: false,
        status: 429,
        errorCode: 'RATE_LIMITED',
        message: 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte warte einige Minuten.',
      };
    }

    if (!cleanUser || !params.password || params.password.length > 128) {
      return {
        ok: false,
        status: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Benutzername oder Passwort ungültig.',
      };
    }

    const users = await this.readUsersFile();
    const found = users.find((u) => u.usernameLower === cleanUser.toLowerCase());

    if (!found) {
      // Perform dummy scrypt work to reduce timing distinction for nonexistent users
      await scryptHash(params.password, '00112233445566778899aabbccddeeff', 64);
      this.recordLoginFailure(rateKey, now);
      return {
        ok: false,
        status: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Benutzername oder Passwort ungültig.',
      };
    }

    const derived = await scryptHash(params.password, found.passwordSalt, 64);
    const expected = Buffer.from(found.passwordHash, 'hex');
    const valid = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);

    if (!valid) {
      this.recordLoginFailure(rateKey, now);
      return {
        ok: false,
        status: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Benutzername oder Passwort ungültig.',
      };
    }

    this.loginAttempts.delete(rateKey);
    const vaultKey = await scryptHash(params.password, found.vaultSalt, 32);

    const rememberMe = Boolean(params.rememberMe);
    const {updatedUser, token} = await this.withLock(async () => {
      const currentUsers = await this.readUsersFile();
      const target = currentUsers.find((u) => u.id === found.id);
      let pub: PublicUser;
      if (target) {
        target.lastLoginAt = new Date().toISOString();
        await this.writeUsersFile(currentUsers);
        pub = this.toPublicUser(target);
      } else {
        pub = this.toPublicUser(found);
      }
      const nextToken = await this.createSession(found.id, pub.role, vaultKey, rememberMe);
      return {updatedUser: pub, token: nextToken};
    });

    return {ok: true, token, user: updatedUser, rememberMe};
  }

  private recordLoginFailure(rateKey: string, now: number): void {
    const existing = this.loginAttempts.get(rateKey);
    if (!existing || existing.resetAt <= now) {
      this.loginAttempts.set(rateKey, {count: 1, resetAt: now + LOGIN_WINDOW_MS});
    } else {
      existing.count += 1;
    }
  }

  async changeOwnPassword(
    session: ActiveSession,
    currentPassword: string,
    newPassword: string,
    currentRawToken?: string | null
  ): Promise<{ok: true} | {ok: false; status: number; errorCode: string; message: string}> {
    if (newPassword.length < 8 || newPassword.length > 128) {
      return {
        ok: false,
        status: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Neues Passwort muss zwischen 8 und 128 Zeichen lang sein.',
      };
    }

    return this.withLock(async () => {
      const users = await this.readUsersFile();
      const user = users.find((u) => u.id === session.userId);
      if (!user) {
        return {ok: false, status: 404, errorCode: 'NOT_FOUND', message: 'Benutzer nicht gefunden.'};
      }

      const derivedCurrent = await scryptHash(currentPassword, user.passwordSalt, 64);
      const expected = Buffer.from(user.passwordHash, 'hex');
      if (derivedCurrent.length !== expected.length || !crypto.timingSafeEqual(derivedCurrent, expected)) {
        return {
          ok: false,
          status: 401,
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Aktuelles Passwort ist nicht korrekt.',
        };
      }

      const oldVaultKey = session.vaultKey;
      const newPasswordSalt = crypto.randomBytes(16).toString('hex');
      const newVaultSalt = crypto.randomBytes(16).toString('hex');
      const newPasswordHash = (await scryptHash(newPassword, newPasswordSalt, 64)).toString('hex');
      const newVaultKey = await scryptHash(newPassword, newVaultSalt, 32);

      // Re-encrypt stored profile secrets with the new vault key so nothing is lost
      const profilePath = this.resolveProfilePath(user.id);
      try {
        const raw = await fs.readFile(profilePath, 'utf8');
        const stored = JSON.parse(raw) as StoredProfileFile;
        if (stored.fhemSecretsEncrypted) {
          const plainFhem = decryptWithVaultKey(stored.fhemSecretsEncrypted, oldVaultKey);
          stored.fhemSecretsEncrypted = Object.keys(plainFhem).length
            ? encryptWithVaultKey(plainFhem, newVaultKey)
            : null;
        }
        if (stored.aiSecretsEncrypted) {
          const plainAi = decryptWithVaultKey(stored.aiSecretsEncrypted, oldVaultKey);
          stored.aiSecretsEncrypted = Object.keys(plainAi).length
            ? encryptWithVaultKey(plainAi, newVaultKey)
            : null;
        }
        stored.updatedAt = new Date().toISOString();
        await this.atomicWriteJson(profilePath, stored);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }

      user.passwordSalt = newPasswordSalt;
      user.passwordHash = newPasswordHash;
      user.vaultSalt = newVaultSalt;
      await this.writeUsersFile(users);

      // Update active session vault key and revoke all other sessions (RAM & disk)
      // If current session was persistent, re-wrap the new vaultKey with current rawToken if supplied
      const rawCurrent = typeof currentRawToken === 'string' && currentRawToken ? currentRawToken : null;
      for (const [hash, s] of this.sessions.entries()) {
        if (s.userId === user.id) {
          if (hash === session.tokenHash) {
            s.vaultKey = newVaultKey;
          } else {
            this.sessions.delete(hash);
          }
        }
      }
      const persisted = await this.readSessionsFile();
      const updatedPersisted: StoredPersistentSession[] = [];
      for (const ps of persisted) {
        if (ps.userId !== user.id) {
          updatedPersisted.push(ps);
        } else if (ps.tokenHash === session.tokenHash && rawCurrent) {
          updatedPersisted.push({
            ...ps,
            wrappedVaultKey: wrapVaultKey(newVaultKey, rawCurrent),
          });
        }
      }
      if (persisted.length > 0 || updatedPersisted.length > 0) {
        await this.writeSessionsFile(updatedPersisted);
      }

      return {ok: true};
    });
  }

  async getProfile(session: ActiveSession): Promise<{hasProfile: boolean; profile: SyncedProfilePayload | null}> {
    const profilePath = this.resolveProfilePath(session.userId);
    try {
      const raw = await fs.readFile(profilePath, 'utf8');
      const stored = JSON.parse(raw) as StoredProfileFile;

      const fhemSecrets = decryptWithVaultKey(stored.fhemSecretsEncrypted, session.vaultKey);
      const aiSecrets = decryptWithVaultKey(stored.aiSecretsEncrypted, session.vaultKey);

      const mergedConfig = stored.fhemConfigPublic
        ? {...stored.fhemConfigPublic, ...fhemSecrets}
        : undefined;
      const mergedAi = stored.aiConfigPublic
        ? {...stored.aiConfigPublic, ...aiSecrets}
        : undefined;

      return {
        hasProfile: true,
        profile: {
          config: mergedConfig,
          aiConfig: mergedAi,
          preferences: stored.preferences || undefined,
          customMedia: stored.customMedia || undefined,
          updatedAt: stored.updatedAt,
        },
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {hasProfile: false, profile: null};
      }
      throw err;
    }
  }

  async saveProfile(
    session: ActiveSession,
    incoming: SyncedProfilePayload
  ): Promise<{updatedAt: string}> {
    const profilePath = this.resolveProfilePath(session.userId);
    const updatedAt = new Date().toISOString();

    const fhemPublic: Record<string, unknown> = {};
    const fhemSecrets: Record<string, string> = {};
    if (incoming.config && typeof incoming.config === 'object' && !Array.isArray(incoming.config)) {
      for (const [k, v] of Object.entries(incoming.config)) {
        if ((FHEM_SECRET_KEYS as readonly string[]).includes(k)) {
          if (typeof v === 'string' && v.length > 0 && v.length <= 2048) {
            fhemSecrets[k] = v;
          }
        } else if (
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean'
        ) {
          fhemPublic[k] = typeof v === 'string' ? v.slice(0, 512) : v;
        }
      }
    }

    const aiPublic: Record<string, unknown> = {};
    const aiSecrets: Record<string, string> = {};
    if (incoming.aiConfig && typeof incoming.aiConfig === 'object' && !Array.isArray(incoming.aiConfig)) {
      for (const [k, v] of Object.entries(incoming.aiConfig)) {
        if ((AI_SECRET_KEYS as readonly string[]).includes(k)) {
          if (typeof v === 'string' && v.length > 0 && v.length <= 2048) {
            aiSecrets[k] = v;
          }
        } else if (
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean'
        ) {
          aiPublic[k] = typeof v === 'string' ? v.slice(0, 4096) : v;
        }
      }
    }

    const cleanMedia = incoming.customMedia
      ? {
          rooms: sanitizeMediaMap(incoming.customMedia.rooms),
          devices: sanitizeMediaMap(incoming.customMedia.devices),
          floorplan: isSafeImageSrc(incoming.customMedia.floorplan)
            ? incoming.customMedia.floorplan.trim()
            : undefined,
        }
      : null;

    const stored: StoredProfileFile = {
      version: 1,
      userId: session.userId,
      updatedAt,
      fhemConfigPublic: fhemPublic,
      fhemSecretsEncrypted: Object.keys(fhemSecrets).length
        ? encryptWithVaultKey(fhemSecrets, session.vaultKey)
        : null,
      aiConfigPublic: Object.keys(aiPublic).length ? aiPublic : null,
      aiSecretsEncrypted: Object.keys(aiSecrets).length
        ? encryptWithVaultKey(aiSecrets, session.vaultKey)
        : null,
      preferences:
        incoming.preferences && typeof incoming.preferences === 'object' && !Array.isArray(incoming.preferences)
          ? incoming.preferences
          : null,
      customMedia: cleanMedia,
    };

    await this.atomicWriteJson(profilePath, stored);
    return {updatedAt};
  }

  async listUsers(): Promise<PublicUser[]> {
    const users = await this.readUsersFile();
    return users.map((u) => this.toPublicUser(u));
  }

  async createUser(params: {
    username: string;
    displayName?: string;
    password: string;
    role: UserRole;
  }): Promise<{ok: true; user: PublicUser} | {ok: false; status: number; errorCode: string; message: string}> {
    const cleanUser = params.username.trim();
    const cleanDisplay = (params.displayName || '').trim() || cleanUser;
    const role: UserRole = params.role === 'admin' ? 'admin' : 'user';
    const err = this.validateCredentialsInput(cleanUser, cleanDisplay, params.password);
    if (err) {
      return {ok: false, status: 400, errorCode: 'VALIDATION_ERROR', message: err};
    }

    return this.withLock(async () => {
      const users = await this.readUsersFile();
      if (users.length >= 50) {
        return {
          ok: false,
          status: 400,
          errorCode: 'USER_LIMIT',
          message: 'Maximale Anzahl von 50 Benutzerprofilen erreicht.',
        };
      }
      if (users.some((u) => u.usernameLower === cleanUser.toLowerCase())) {
        return {
          ok: false,
          status: 409,
          errorCode: 'USERNAME_EXISTS',
          message: `Benutzername „${cleanUser}“ ist bereits vergeben.`,
        };
      }

      const passwordSalt = crypto.randomBytes(16).toString('hex');
      const vaultSalt = crypto.randomBytes(16).toString('hex');
      const passwordHash = (await scryptHash(params.password, passwordSalt, 64)).toString('hex');

      const record: StoredUserRecord = {
        id: crypto.randomUUID(),
        username: cleanUser,
        usernameLower: cleanUser.toLowerCase(),
        displayName: cleanDisplay,
        role,
        passwordSalt,
        passwordHash,
        vaultSalt,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };

      users.push(record);
      await this.writeUsersFile(users);
      return {ok: true, user: this.toPublicUser(record)};
    });
  }

  async updateUser(
    targetUserId: string,
    patch: {displayName?: string; role?: UserRole; newPassword?: string}
  ): Promise<{ok: true; user: PublicUser} | {ok: false; status: number; errorCode: string; message: string}> {
    if (!UUID_RE.test(targetUserId)) {
      return {ok: false, status: 400, errorCode: 'INVALID_ID', message: 'Ungültige Benutzer-ID.'};
    }

    return this.withLock(async () => {
      const users = await this.readUsersFile();
      const user = users.find((u) => u.id === targetUserId);
      if (!user) {
        return {ok: false, status: 404, errorCode: 'NOT_FOUND', message: 'Benutzer nicht gefunden.'};
      }

      if (patch.role && patch.role !== user.role) {
        if (user.role === 'admin' && patch.role === 'user') {
          const adminCount = users.filter((u) => u.role === 'admin').length;
          if (adminCount <= 1) {
            return {
              ok: false,
              status: 400,
              errorCode: 'LAST_ADMIN',
              message: 'Mindestens ein Administrator-Konto muss erhalten bleiben.',
            };
          }
        }
        user.role = patch.role === 'admin' ? 'admin' : 'user';
      }

      if (typeof patch.displayName === 'string') {
        const cleanDisplay = patch.displayName.trim();
        if (cleanDisplay.length > 0 && cleanDisplay.length <= 60) {
          user.displayName = cleanDisplay;
        }
      }

      if (typeof patch.newPassword === 'string' && patch.newPassword.length > 0) {
        if (patch.newPassword.length < 8 || patch.newPassword.length > 128) {
          return {
            ok: false,
            status: 400,
            errorCode: 'VALIDATION_ERROR',
            message: 'Neues Passwort muss zwischen 8 und 128 Zeichen lang sein.',
          };
        }
        user.passwordSalt = crypto.randomBytes(16).toString('hex');
        user.vaultSalt = crypto.randomBytes(16).toString('hex');
        user.passwordHash = (await scryptHash(patch.newPassword, user.passwordSalt, 64)).toString('hex');

        // Clear undecryptable encrypted secrets after admin password reset while keeping public preferences intact
        const profilePath = this.resolveProfilePath(user.id);
        try {
          const raw = await fs.readFile(profilePath, 'utf8');
          const stored = JSON.parse(raw) as StoredProfileFile;
          stored.fhemSecretsEncrypted = null;
          stored.aiSecretsEncrypted = null;
          stored.updatedAt = new Date().toISOString();
          await this.atomicWriteJson(profilePath, stored);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        await this.revokeUserSessions(user.id);
      }

      await this.writeUsersFile(users);
      return {ok: true, user: this.toPublicUser(user)};
    });
  }

  async deleteUser(
    targetUserId: string
  ): Promise<{ok: true} | {ok: false; status: number; errorCode: string; message: string}> {
    if (!UUID_RE.test(targetUserId)) {
      return {ok: false, status: 400, errorCode: 'INVALID_ID', message: 'Ungültige Benutzer-ID.'};
    }

    return this.withLock(async () => {
      const users = await this.readUsersFile();
      const idx = users.findIndex((u) => u.id === targetUserId);
      if (idx === -1) {
        return {ok: false, status: 404, errorCode: 'NOT_FOUND', message: 'Benutzer nicht gefunden.'};
      }

      const target = users[idx];
      if (target.role === 'admin') {
        const adminCount = users.filter((u) => u.role === 'admin').length;
        if (adminCount <= 1) {
          return {
            ok: false,
            status: 400,
            errorCode: 'LAST_ADMIN',
            message: 'Der letzte Administrator kann nicht gelöscht werden.',
          };
        }
      }

      users.splice(idx, 1);
      await this.writeUsersFile(users);
      await this.revokeUserSessions(targetUserId);

      const profilePath = this.resolveProfilePath(targetUserId);
      await fs.unlink(profilePath).catch(() => undefined);
      return {ok: true};
    });
  }
}
