import type {AuthStatus, ManagedFhemInfo, SyncedUserProfile, UserAccount, UserRole} from '../types/fhem';

// Keep session token strictly in JS memory (never localStorage or sessionStorage)
let activeSessionToken: string | null = null;

export function getActiveSessionToken(): string | null {
  return activeSessionToken;
}

export function clearActiveSessionToken(): void {
  activeSessionToken = null;
}

function buildHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'FHEM-Control-Desk',
  };
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (activeSessionToken) {
    headers['X-Session-Token'] = activeSessionToken;
  }
  return headers;
}

export async function fetchAuthStatus(): Promise<AuthStatus | null> {
  try {
    const res = await fetch('/api/auth/status', {
      method: 'GET',
      credentials: 'same-origin',
      headers: buildHeaders(false),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      initialized?: boolean;
      userCount?: number;
      authenticated?: boolean;
      user?: UserAccount | null;
      requireLogin?: boolean;
      bootstrapTokenRequired?: boolean;
      managedFhem?: ManagedFhemInfo;
    };
    if (!json.ok) return null;
    if (!json.authenticated) {
      activeSessionToken = null;
    }
    return {
      initialized: Boolean(json.initialized),
      userCount: Number(json.userCount || 0),
      authenticated: Boolean(json.authenticated),
      user: json.user || null,
      requireLogin: json.requireLogin !== false,
      bootstrapTokenRequired: Boolean(json.bootstrapTokenRequired),
      managedFhem: json.managedFhem,
    };
  } catch {
    return null;
  }
}

export async function bootstrapAdminAccount(params: {
  username: string;
  displayName: string;
  password: string;
  setupToken?: string;
  rememberMe?: boolean;
}): Promise<{ok: true; user: UserAccount} | {ok: false; message: string}> {
  try {
    const res = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildHeaders(true),
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as {ok?: boolean; token?: string; user?: UserAccount; message?: string};
    if (!res.ok || !json.ok || !json.token || !json.user) {
      return {ok: false, message: json.message || 'Admin-Profil konnte nicht erstellt werden.'};
    }
    activeSessionToken = json.token;
    return {ok: true, user: json.user};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}

export async function loginAccount(params: {
  username: string;
  password: string;
  rememberMe?: boolean;
}): Promise<{ok: true; user: UserAccount} | {ok: false; message: string}> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildHeaders(true),
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as {ok?: boolean; token?: string; user?: UserAccount; message?: string};
    if (!res.ok || !json.ok || !json.token || !json.user) {
      return {ok: false, message: json.message || 'Anmeldung fehlgeschlagen.'};
    }
    activeSessionToken = json.token;
    return {ok: true, user: json.user};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}

export async function logoutAccount(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildHeaders(false),
    });
  } catch {
    // ignore network errors on logout
  } finally {
    activeSessionToken = null;
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ok: boolean; message?: string}> {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildHeaders(true),
      body: JSON.stringify({currentPassword, newPassword}),
    });
    const json = (await res.json()) as {ok?: boolean; message?: string};
    if (!res.ok || !json.ok) {
      return {ok: false, message: json.message || 'Passwort konnte nicht geändert werden.'};
    }
    return {ok: true};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}

export async function fetchSyncedProfile(): Promise<{
  ok: boolean;
  hasProfile: boolean;
  profile: SyncedUserProfile | null;
  message?: string;
}> {
  try {
    const res = await fetch('/api/profile', {
      method: 'GET',
      credentials: 'same-origin',
      headers: buildHeaders(false),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      hasProfile?: boolean;
      profile?: SyncedUserProfile | null;
      message?: string;
    };
    if (!res.ok || !json.ok) {
      return {ok: false, hasProfile: false, profile: null, message: json.message || 'Profil konnte nicht geladen werden.'};
    }
    return {
      ok: true,
      hasProfile: Boolean(json.hasProfile),
      profile: json.profile || null,
    };
  } catch {
    return {ok: false, hasProfile: false, profile: null, message: 'Server nicht erreichbar.'};
  }
}

export async function saveSyncedProfile(
  profile: SyncedUserProfile
): Promise<{ok: boolean; updatedAt?: string; message?: string}> {
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildHeaders(true),
      body: JSON.stringify(profile),
    });
    const json = (await res.json()) as {ok?: boolean; updatedAt?: string; message?: string};
    if (!res.ok || !json.ok) {
      return {ok: false, message: json.message || 'Profil konnte nicht synchronisiert werden.'};
    }
    return {ok: true, updatedAt: json.updatedAt};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}

export async function adminListUsers(): Promise<{
  ok: boolean;
  users: UserAccount[];
  message?: string;
}> {
  try {
    const res = await fetch('/api/admin/users', {
      method: 'GET',
      credentials: 'same-origin',
      headers: buildHeaders(false),
    });
    const json = (await res.json()) as {ok?: boolean; users?: UserAccount[]; message?: string};
    if (!res.ok || !json.ok) {
      return {ok: false, users: [], message: json.message || 'Benutzer konnten nicht geladen werden.'};
    }
    return {ok: true, users: json.users || []};
  } catch {
    return {ok: false, users: [], message: 'Server nicht erreichbar.'};
  }
}

export async function adminCreateUser(params: {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}): Promise<{ok: boolean; user?: UserAccount; message?: string}> {
  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildHeaders(true),
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as {ok?: boolean; user?: UserAccount; message?: string};
    if (!res.ok || !json.ok) {
      return {ok: false, message: json.message || 'Benutzer konnte nicht angelegt werden.'};
    }
    return {ok: true, user: json.user};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}

export async function adminUpdateUser(
  userId: string,
  patch: {displayName?: string; role?: UserRole; newPassword?: string}
): Promise<{ok: boolean; user?: UserAccount; message?: string}> {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: buildHeaders(true),
      body: JSON.stringify(patch),
    });
    const json = (await res.json()) as {ok?: boolean; user?: UserAccount; message?: string};
    if (!res.ok || !json.ok) {
      return {ok: false, message: json.message || 'Benutzer konnte nicht aktualisiert werden.'};
    }
    return {ok: true, user: json.user};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}

export async function adminDeleteUser(userId: string): Promise<{ok: boolean; message?: string}> {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: buildHeaders(false),
    });
    const json = (await res.json()) as {ok?: boolean; message?: string};
    if (!res.ok || !json.ok) {
      return {ok: false, message: json.message || 'Benutzer konnte nicht gelöscht werden.'};
    }
    return {ok: true};
  } catch {
    return {ok: false, message: 'Server nicht erreichbar.'};
  }
}
