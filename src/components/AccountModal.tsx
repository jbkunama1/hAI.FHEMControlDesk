import React, {useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {AuthStatus, UserAccount} from '../types/fhem';
import {bootstrapAdminAccount, changeOwnPassword, loginAccount} from '../lib/profileClient';

interface AccountModalProps {
  open: boolean;
  authStatus: AuthStatus;
  currentUser: UserAccount | null;
  syncing: boolean;
  lastSyncedAt: string | null;
  onClose: () => void;
  onAuthenticated: (user: UserAccount, isBootstrap: boolean) => Promise<void>;
  onLogout: () => Promise<void>;
  onPullProfile: () => Promise<void>;
  onPushProfile: () => Promise<void>;
  onOpenUserManagement: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  open,
  authStatus,
  currentUser,
  syncing,
  lastSyncedAt,
  onClose,
  onAuthenticated,
  onLogout,
  onPullProfile,
  onPushProfile,
  onOpenUserManagement,
}) => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Change password state
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');

  if (!open) return null;

  const isBootstrapMode = !authStatus.initialized && !currentUser;

  const resetForms = () => {
    setUsername('');
    setDisplayName('');
    setPassword('');
    setPasswordConfirm('');
    setSetupToken('');
    setCurrentPw('');
    setNewPw('');
    setNewPwConfirm('');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password !== passwordConfirm) {
      setErrorMsg('Die beiden Passwörter stimmen nicht überein.');
      return;
    }

    setBusy(true);
    const res = await bootstrapAdminAccount({
      username: username.trim(),
      displayName: displayName.trim() || username.trim(),
      password,
      rememberMe,
      ...(authStatus.bootstrapTokenRequired ? {setupToken: setupToken.trim()} : {}),
    });
    setBusy(false);

    if (!res.ok) {
      setErrorMsg(res.message);
      return;
    }

    resetForms();
    await onAuthenticated(res.user, true);
    onClose();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    const res = await loginAccount({username: username.trim(), password, rememberMe});
    setBusy(false);

    if (!res.ok) {
      setErrorMsg(res.message);
      return;
    }

    resetForms();
    await onAuthenticated(res.user, false);
    onClose();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPw !== newPwConfirm) {
      setErrorMsg('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    setBusy(true);
    const res = await changeOwnPassword(currentPw, newPw);
    setBusy(false);

    if (!res.ok) {
      setErrorMsg(res.message || 'Passwort konnte nicht geändert werden.');
      return;
    }

    setCurrentPw('');
    setNewPw('');
    setNewPwConfirm('');
    setPwOpen(false);
    setSuccessMsg('Passwort geändert und Profil-Tresor neu verschlüsselt.');
  };

  const initials = currentUser
    ? currentUser.displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('') || currentUser.username.slice(0, 2).toUpperCase()
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Benutzerprofil & Anmeldung"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border theme-border theme-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b theme-border px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl theme-tonal font-display font-bold text-sm">
              {currentUser ? initials : isBootstrapMode ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                {currentUser
                  ? currentUser.displayName
                  : isBootstrapMode
                    ? 'Erstes Admin-Profil erstellen'
                    : 'Mit Profil anmelden'}
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {currentUser
                  ? `@${currentUser.username} · ${currentUser.role === 'admin' ? 'Administrator' : 'Benutzer'}`
                  : 'Geräteübergreifende Synchronisation für FHEM-Setup & Favoriten'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-2xl bg-red-500/12 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 rounded-2xl bg-emerald-500/12 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Signed-in Profile View */}
          {currentUser ? (
            <div className="space-y-4">
              <div className="rounded-2xl border theme-border theme-surface-alt p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <Cloud className="h-4 w-4 theme-text" />
                    Profil-Synchronisation aktiv
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                    {syncing
                      ? 'Synchronisiert…'
                      : lastSyncedAt
                        ? `Stand ${new Date(lastSyncedAt).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})}`
                        : 'Bereit'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  FHEM-Verbindung, Favoriten, Kachelgrößen, Design-Theme und eigene Raumfotos werden automatisch auf dem Server gesichert (Zugangsdaten AES-256-GCM verschlüsselt).
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void onPullProfile()}
                    className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border theme-border bg-[var(--m3-surface)] px-3 text-xs font-semibold text-slate-700 hover:opacity-90 disabled:opacity-50 dark:text-slate-200"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    Vom Server laden
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void onPushProfile()}
                    className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl theme-tonal px-3 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    Jetzt sichern
                  </button>
                </div>
              </div>

              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenUserManagement();
                  }}
                  className="flex min-h-[46px] w-full items-center justify-between rounded-2xl border theme-border px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.04]"
                >
                  <span className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 theme-text" />
                    Benutzerverwaltung ({authStatus.userCount} {authStatus.userCount === 1 ? 'Profil' : 'Profile'})
                  </span>
                  <Shield className="h-4 w-4 text-slate-400" />
                </button>
              )}

              {/* Change own password */}
              <div className="rounded-2xl border theme-border">
                <button
                  type="button"
                  onClick={() => setPwOpen((v) => !v)}
                  className="flex min-h-[44px] w-full items-center justify-between px-4 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    Eigenes Passwort ändern
                  </span>
                  <span className="text-[11px] text-slate-400">{pwOpen ? 'Schließen' : 'Öffnen'}</span>
                </button>
                {pwOpen && (
                  <form onSubmit={handleChangePassword} className="space-y-2.5 border-t theme-border p-4">
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="Aktuelles Passwort"
                      required
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="Neues Passwort (mind. 8 Zeichen)"
                      minLength={8}
                      required
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPwConfirm}
                      onChange={(e) => setNewPwConfirm(e.target.value)}
                      placeholder="Neues Passwort wiederholen"
                      minLength={8}
                      required
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="min-h-[44px] w-full rounded-xl theme-btn-primary text-xs font-semibold disabled:opacity-60"
                    >
                      {busy ? 'Speichert…' : 'Passwort aktualisieren'}
                    </button>
                  </form>
                )}
              </div>

              <button
                type="button"
                onClick={async () => {
                  await onLogout();
                  onClose();
                }}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-red-500/12 text-xs font-semibold text-red-600 hover:bg-red-500/20 dark:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </button>
            </div>
          ) : isBootstrapMode ? (
            /* First-Run Admin Setup Form */
            <form onSubmit={handleBootstrap} className="space-y-3.5">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Lege dein erstes <strong>Administrator-Profil</strong> an. Deine aktuellen FHEM-Einstellungen, Favoriten, Themes und Raumfotos werden automatisch darin gespeichert und stehen danach auf jedem Smartphone, Tablet und PC bereit.
              </p>

              {authStatus.bootstrapTokenRequired && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Einrichtungs-Code (ADMIN_BOOTSTRAP_TOKEN)
                  </label>
                  <input
                    type="password"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Setup-Code aus der Server-Konfiguration"
                    required
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Benutzername
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="z. B. daniel"
                  minLength={3}
                  maxLength={32}
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Anzeigename (optional)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="z. B. Daniel (Admin)"
                  maxLength={60}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Passwort (mind. 8 Zeichen)
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  maxLength={128}
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Passwort bestätigen
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  maxLength={128}
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[var(--accent-ring)]"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Auf diesem Gerät angemeldet bleiben (30 Tage)
                </span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl theme-btn-primary text-sm font-semibold disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                {busy ? 'Erstellt Admin-Profil…' : 'Admin-Profil erstellen & synchronisieren'}
              </button>
            </form>
          ) : (
            /* Sign-in Form */
            <form onSubmit={handleLogin} className="space-y-3.5">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Melde dich mit deinem Profil an, um deine gespeicherte FHEM-Verbindung, Favoriten, Themes und Raumfotos automatisch auf dieses Gerät zu laden.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Benutzername
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Benutzername"
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Passwort
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[var(--accent-ring)]"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Auf diesem Gerät angemeldet bleiben (30 Tage)
                </span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl theme-btn-primary text-sm font-semibold disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {busy ? 'Meldet an…' : 'Anmelden & Profil laden'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
