import React, {useState} from 'react';
import {AlertTriangle, KeyRound, Lock, LogIn, ShieldCheck, UserPlus} from 'lucide-react';
import type {AuthStatus, UserAccount} from '../types/fhem';
import {bootstrapAdminAccount, loginAccount} from '../lib/profileClient';

interface AuthGateScreenProps {
  authStatus: AuthStatus;
  onAuthenticated: (user: UserAccount, isBootstrap: boolean) => Promise<void>;
}

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  authStatus,
  onAuthenticated,
}) => {
  const isBootstrapMode = !authStatus.initialized;

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

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

    await onAuthenticated(res.user, true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    const res = await loginAccount({username: username.trim(), password, rememberMe});
    setBusy(false);

    if (!res.ok) {
      setErrorMsg(res.message);
      return;
    }

    await onAuthenticated(res.user, false);
  };

  return (
    <div className="min-h-screen theme-canvas text-slate-900 dark:text-[#E6EDF3] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl theme-surface border theme-border shadow-md">
            <img
              src="/icon.svg"
              alt="FHEM Control Desk"
              className="h-10 w-10 rounded-xl"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              FHEM Control Desk
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isBootstrapMode
                ? 'Ersteinrichtung — Administrator-Profil anlegen'
                : 'Geschützter Smart-Home-Zugang — Bitte anmelden'}
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="rounded-3xl border theme-border theme-surface p-6 shadow-xl space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-red-300/70 bg-red-500/10 px-3.5 py-3 text-xs text-red-700 dark:border-red-500/30 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isBootstrapMode ? (
            <form onSubmit={handleBootstrap} className="space-y-3.5">
              <div className="rounded-2xl theme-tonal px-3.5 py-3 text-xs leading-relaxed">
                Lege jetzt dein erstes <strong>Administrator-Konto</strong> an. Erst nach erfolgreicher Anmeldung sind Oberfläche, FHEM-Verbindung und Profil-Synchronisation freigeschaltet.
              </div>

              {authStatus.bootstrapTokenRequired && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Einrichtungs-Code (ADMIN_BOOTSTRAP_TOKEN)
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder="Setup-Code aus deiner Server-Konfiguration"
                      required
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
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
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
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
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
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
                  placeholder="Sicheres Passwort wählen"
                  minLength={8}
                  maxLength={128}
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
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
                  placeholder="Passwort wiederholen"
                  minLength={8}
                  maxLength={128}
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
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
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl theme-btn-primary text-sm font-semibold disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                {busy ? 'Erstellt Admin-Konto…' : 'Admin-Konto erstellen & starten'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Benutzername
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Benutzername"
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
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
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
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
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl theme-btn-primary text-sm font-semibold disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {busy ? 'Meldet an…' : 'Anmelden'}
              </button>
            </form>
          )}
        </div>

        {/* Subtle security footer */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          {isBootstrapMode ? (
            <>
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Einmalige Ersteinrichtung — danach nur noch per Anmeldung erreichbar</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>FHEM-Steuerung & Profile sind serverseitig geschützt</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
