import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {AuthStatus, UserAccount, UserRole} from '../types/fhem';
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminUpdateUser,
} from '../lib/profileClient';

interface ProfileAdminSectionProps {
  authStatus: AuthStatus;
  currentUser: UserAccount | null;
  syncing: boolean;
  lastSyncedAt: string | null;
  onOpenAccountModal: () => void;
  onPullProfile: () => Promise<void>;
  onPushProfile: () => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshAuthStatus: () => Promise<void>;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const ProfileAdminSection: React.FC<ProfileAdminSectionProps> = ({
  authStatus,
  currentUser,
  syncing,
  lastSyncedAt,
  onOpenAccountModal,
  onPullProfile,
  onPushProfile,
  onLogout,
  onRefreshAuthStatus,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline password reset & delete confirm state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const adminCount = useMemo(
    () => users.filter((u) => u.role === 'admin').length,
    [users]
  );

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    setAdminError(null);
    const res = await adminListUsers();
    if (res.ok) {
      setUsers(res.users);
    } else {
      setAdminError(res.message || 'Benutzerliste konnte nicht geladen werden.');
    }
    setLoadingUsers(false);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    } else {
      setUsers([]);
    }
  }, [isAdmin, loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminSuccess(null);

    const cleanUser = newUsername.trim();
    const cleanName = newDisplayName.trim() || cleanUser;
    if (!cleanUser) {
      setAdminError('Bitte einen Benutzernamen eingeben.');
      return;
    }
    if (newPassword.length < 8) {
      setAdminError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setCreating(true);
    const res = await adminCreateUser({
      username: cleanUser,
      displayName: cleanName,
      password: newPassword,
      role: newRole,
    });
    setCreating(false);

    if (!res.ok) {
      setAdminError(res.message || 'Benutzer konnte nicht angelegt werden.');
      return;
    }

    setNewUsername('');
    setNewDisplayName('');
    setNewRole('user');
    setNewPassword('');
    setAdminSuccess(`Benutzer „${cleanName}“ wurde angelegt.`);
    await loadUsers();
    await onRefreshAuthStatus();
  };

  const handleToggleRole = async (user: UserAccount) => {
    setAdminError(null);
    setAdminSuccess(null);
    const nextRole: UserRole = user.role === 'admin' ? 'user' : 'admin';
    setBusyUserId(user.id);
    const res = await adminUpdateUser(user.id, {role: nextRole});
    setBusyUserId(null);
    if (!res.ok) {
      setAdminError(res.message || 'Rolle konnte nicht geändert werden.');
      return;
    }
    setAdminSuccess(
      `Rolle für „${user.displayName}“ auf ${nextRole === 'admin' ? 'Administrator' : 'Benutzer'} geändert.`
    );
    await loadUsers();
    await onRefreshAuthStatus();
  };

  const handleResetPassword = async (user: UserAccount) => {
    setAdminError(null);
    setAdminSuccess(null);
    if (resetPassword.length < 8) {
      setAdminError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    setBusyUserId(user.id);
    const res = await adminUpdateUser(user.id, {newPassword: resetPassword});
    setBusyUserId(null);
    if (!res.ok) {
      setAdminError(res.message || 'Passwort konnte nicht zurückgesetzt werden.');
      return;
    }
    setResetUserId(null);
    setResetPassword('');
    setAdminSuccess(`Passwort für „${user.displayName}“ wurde aktualisiert.`);
  };

  const handleDeleteUser = async (user: UserAccount) => {
    setAdminError(null);
    setAdminSuccess(null);
    setBusyUserId(user.id);
    const res = await adminDeleteUser(user.id);
    setBusyUserId(null);
    if (!res.ok) {
      setAdminError(res.message || 'Benutzer konnte nicht gelöscht werden.');
      return;
    }
    setDeleteConfirmId(null);
    setAdminSuccess(`Benutzer „${user.displayName}“ wurde gelöscht.`);
    await loadUsers();
    await onRefreshAuthStatus();
  };

  return (
    <div className="space-y-5">
      {/* Card 1: Profile & Cross-Device Sync */}
      <div className="rounded-2xl border theme-surface p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cloud className="h-4.5 w-4.5 theme-text" />
              Profil & Geräte-Synchronisation
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Synchronisiere FHEM-Verbindung, Favoriten, Kachelgrößen, Farbthemes und Raumfotos über Smartphone, Tablet und Desktop.
            </p>
          </div>
          <span className="rounded-xl border theme-border px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {authStatus.userCount === 0
              ? 'Noch kein Profil'
              : `${authStatus.userCount} ${authStatus.userCount === 1 ? 'Profil' : 'Profile'} auf dem Server`}
          </span>
        </div>

        {!currentUser ? (
          <div className="rounded-2xl border theme-border bg-slate-50/70 dark:bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {!authStatus.initialized
                  ? 'Noch kein Admin-Profil eingerichtet'
                  : 'Aktuell nicht angemeldet (nur lokal)'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                {!authStatus.initialized
                  ? 'Erstelle das erste Administrator-Profil, um deine aktuelle Einrichtung automatisch auf dem Server zu sichern und auf weiteren Geräten direkt abzurufen.'
                  : 'Melde dich mit deinem Profil an, um deine FHEM-Konfiguration, Favoriten und Raumfotos sofort auf dieses Gerät zu laden.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAccountModal}
              className="theme-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold shrink-0"
            >
              {!authStatus.initialized ? (
                <>
                  <UserPlus className="h-4 w-4" />
                  Erstes Admin-Profil erstellen
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Mit Profil anmelden
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border theme-border bg-slate-50/70 dark:bg-white/[0.03] p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl theme-tonal font-display text-sm font-bold">
                  {getInitials(currentUser.displayName)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {currentUser.displayName}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg theme-tonal px-2 py-0.5 text-[11px] font-semibold">
                      <Shield className="h-3 w-3" />
                      {currentUser.role === 'admin' ? 'Administrator' : 'Benutzer'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    @{currentUser.username} ·{' '}
                    {syncing
                      ? 'Synchronisiere…'
                      : lastSyncedAt
                        ? `Zuletzt synchronisiert: ${lastSyncedAt}`
                        : 'Automatische Synchronisation aktiv'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void onPullProfile()}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border theme-border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  Vom Server laden
                </button>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void onPushProfile()}
                  className="theme-btn-primary inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  Jetzt sichern
                </button>
                <button
                  type="button"
                  onClick={onOpenAccountModal}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border theme-border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Passwort ändern
                </button>
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-300/70 px-3 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:border-red-500/30 dark:text-red-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Abmelden
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Alle Änderungen an FHEM-Verbindung, Favoriten, Kachelgrößen, Farbtheme und eigenen Bildern werden automatisch mit deinem Profil abgeglichen. FHEM- und KI-Zugangsdaten werden serverseitig nur verschlüsselt gespeichert.
            </p>
          </div>
        )}
      </div>

      {/* Card 2: Admin User Management */}
      {isAdmin && (
        <div className="rounded-2xl border theme-surface p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="h-4.5 w-4.5 theme-text" />
                Benutzerverwaltung
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Lege eigene Profile für weitere Familienmitglieder oder Wand-Tablets an, ändere Rollen oder setze Passwörter zurück.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadUsers()}
              disabled={loadingUsers}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border theme-border px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>

          {adminError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-300/70 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{adminError}</span>
            </div>
          )}

          {adminSuccess && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-300/70 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{adminSuccess}</span>
            </div>
          )}

          {/* Existing Users List */}
          <div className="space-y-2.5">
            {loadingUsers && users.length === 0 ? (
              <div className="h-20 rounded-2xl border theme-border animate-pulse bg-slate-100/60 dark:bg-white/[0.03]" />
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const isLastAdmin = user.role === 'admin' && adminCount <= 1;
                const busy = busyUserId === user.id;

                return (
                  <div
                    key={user.id}
                    className="rounded-2xl border theme-border bg-slate-50/60 dark:bg-white/[0.02] p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl theme-tonal font-display text-xs font-bold">
                          {getInitials(user.displayName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {user.displayName}
                            </span>
                            {isSelf && (
                              <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                                Du
                              </span>
                            )}
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                user.role === 'admin'
                                  ? 'theme-tonal'
                                  : 'bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                              }`}
                            >
                              {user.role === 'admin' ? 'Administrator' : 'Benutzer'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            @{user.username}
                            {user.lastLoginAt
                              ? ` · Letzter Login: ${new Date(user.lastLoginAt).toLocaleString('de-DE')}`
                              : ' · Noch nie angemeldet'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy || isLastAdmin}
                          onClick={() => void handleToggleRole(user)}
                          title={
                            isLastAdmin
                              ? 'Mindestens ein Administrator muss bestehen bleiben'
                              : user.role === 'admin'
                                ? 'Zu normalem Benutzer herabstufen'
                                : 'Zum Administrator befördern'
                          }
                          className="min-h-[38px] rounded-xl border theme-border px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                        >
                          {user.role === 'admin' ? 'Als Benutzer' : 'Als Admin'}
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setResetUserId((prev) => (prev === user.id ? null : user.id));
                            setResetPassword('');
                            setDeleteConfirmId(null);
                          }}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border theme-border px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Passwort
                        </button>

                        <button
                          type="button"
                          disabled={busy || isSelf || isLastAdmin}
                          onClick={() => {
                            setDeleteConfirmId((prev) => (prev === user.id ? null : user.id));
                            setResetUserId(null);
                          }}
                          title={
                            isSelf
                              ? 'Eigenes Profil kann hier nicht gelöscht werden'
                              : isLastAdmin
                                ? 'Letzter Administrator kann nicht gelöscht werden'
                                : 'Benutzer löschen'
                          }
                          className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-red-300/70 px-2.5 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-35 dark:border-red-500/30 dark:text-red-400"
                          aria-label={`Benutzer ${user.displayName} löschen`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Password Reset */}
                    {resetUserId === user.id && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t theme-border">
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="Neues Passwort (mind. 8 Zeichen)"
                          autoComplete="new-password"
                          className="flex-1 min-h-[40px] rounded-xl border theme-border bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:bg-[#0D1117] dark:text-slate-100"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleResetPassword(user)}
                            className="theme-btn-primary min-h-[40px] rounded-xl px-3.5 text-xs font-semibold disabled:opacity-50"
                          >
                            Speichern
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId(null);
                              setResetPassword('');
                            }}
                            className="min-h-[40px] rounded-xl border theme-border px-3 text-xs font-medium text-slate-600 dark:text-slate-300"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline Delete Confirmation */}
                    {deleteConfirmId === user.id && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t theme-border text-xs">
                        <span className="text-red-700 dark:text-red-300 font-medium">
                          Profil „{user.displayName}“ inkl. gespeicherter Einstellungen unwiderruflich löschen?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteUser(user)}
                            className="min-h-[38px] rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Endgültig löschen
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="min-h-[38px] rounded-xl border theme-border px-3 text-xs font-medium text-slate-600 dark:text-slate-300"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Create New User Form */}
          <form
            onSubmit={handleCreateUser}
            className="rounded-2xl border theme-border bg-slate-50/60 dark:bg-white/[0.02] p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 theme-text" />
              Neuen Benutzer anlegen
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Benutzername
                </span>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="z.B. tablet_flur"
                  autoComplete="off"
                  className="w-full min-h-[42px] rounded-xl border theme-border bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:bg-[#0D1117] dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Anzeigename
                </span>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="z.B. Wandtablet Flur"
                  className="w-full min-h-[42px] rounded-xl border theme-border bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:bg-[#0D1117] dark:text-slate-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Rolle
                </span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full min-h-[42px] rounded-xl border theme-border bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:bg-[#0D1117] dark:text-slate-100"
                >
                  <option value="user">Benutzer (eigenes Profil)</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Initiales Passwort
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mind. 8 Zeichen"
                  autoComplete="new-password"
                  className="w-full min-h-[42px] rounded-xl border theme-border bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:bg-[#0D1117] dark:text-slate-100"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="theme-btn-primary inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 text-xs font-semibold disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {creating ? 'Lege an…' : 'Benutzer erstellen'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
