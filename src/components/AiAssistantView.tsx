import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageSquare,
  Play,
  PlayCircle,
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
  Wifi,
} from 'lucide-react';
import type {
  AiAssistantConfig,
  AiChatMessage,
  AiCommandAction,
  CommandExecutionResult,
  FhemDevice,
} from '../types/fhem';
import {
  AI_PROVIDER_PRESETS,
  isAiEndpointConfigured,
  sendAiAssistantMessage,
  testAiConnection,
} from '../lib/aiClient';
import {FHEM_COMMANDREF, searchCommandref, type CommandrefEntry} from '../lib/fhemCommandref';

interface AiAssistantViewProps {
  devices: FhemDevice[];
  aiConfig: AiAssistantConfig;
  aiKeystoreEncrypted: boolean;
  aiKeystoreUpdatedAt: string | null;
  onSaveAiConfig: (next: AiAssistantConfig) => Promise<void>;
  onExecuteAiCommand: (cmd: string, requiresConfirm: boolean) => Promise<CommandExecutionResult>;
}

type AssistantSubTab = 'chat' | 'commandref' | 'setup';

const STARTER_PROMPTS = [
  'Lege mir ein DOIF für Deckenleuchte Wohnzimmer an, das um 20 Uhr angeht und um 22 Uhr wieder aus.',
  'Welche Fenster sind aktuell offen und welche ZigBee-Batterien sind schwach?',
  'Erstelle ein at zum Sonnenuntergang, das den Rollladen Terrasse schließt.',
  'Zeige mir alle aktiven Lichter und den aktuellen Stromverbrauch im Haus.',
];

// Safe markdown-lite renderer (never uses dangerouslySetInnerHTML)
function renderFormattedText(content: string): React.ReactNode {
  // Remove fenced fhem blocks from prose since commands are shown as interactive cards below,
  // while keeping non-fhem blocks readable.
  const segments = content.split(/(```[\s\S]*?```)/g);

  return segments.map((seg, segIdx) => {
    if (seg.startsWith('```') && seg.endsWith('```')) {
      const firstNewline = seg.indexOf('\n');
      const lang = seg.slice(3, firstNewline > 3 ? firstNewline : 3).trim().toLowerCase();
      const body = firstNewline !== -1 ? seg.slice(firstNewline + 1, -3).trim() : seg.slice(3, -3).trim();
      if (!body) return null;
      return (
        <pre
          key={segIdx}
          className="my-2 overflow-x-auto rounded-xl bg-[#0B0E14] px-3.5 py-2.5 font-mono text-xs leading-relaxed text-emerald-300"
        >
          {lang && <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{lang}</div>}
          {body}
        </pre>
      );
    }

    const lines = seg.split('\n');
    return (
      <div key={segIdx} className="space-y-1.5">
        {lines.map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          const isBullet = /^[-*•]\s+/.test(trimmed);
          const cleanLine = isBullet ? trimmed.replace(/^[-*•]\s+/, '') : trimmed;

          // Inline **bold** and `code`
          const parts = cleanLine.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((tok, i) => {
            if (tok.startsWith('**') && tok.endsWith('**')) {
              return (
                <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
                  {tok.slice(2, -2)}
                </strong>
              );
            }
            if (tok.startsWith('`') && tok.endsWith('`')) {
              return (
                <code
                  key={i}
                  className="rounded-md bg-slate-200/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-900 dark:bg-white/10 dark:text-slate-100"
                >
                  {tok.slice(1, -1)}
                </code>
              );
            }
            return <React.Fragment key={i}>{tok}</React.Fragment>;
          });

          return isBullet ? (
            <div key={lineIdx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]" />
              <span className="leading-relaxed">{parts}</span>
            </div>
          ) : (
            <p key={lineIdx} className="leading-relaxed">
              {parts}
            </p>
          );
        })}
      </div>
    );
  });
}

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  devices,
  aiConfig,
  aiKeystoreEncrypted,
  aiKeystoreUpdatedAt,
  onSaveAiConfig,
  onExecuteAiCommand,
}) => {
  const [subTab, setSubTab] = useState<AssistantSubTab>('chat');
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      timestamp: new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}),
      mode: isAiEndpointConfigured(aiConfig) ? 'openai' : 'local_helper',
      content:
        'Hallo! Ich bin dein **FHEM KI-Assistent** mit integrierter **FHEM Commandref** und Live-Zugriff auf deine Geräte.\n\nSag mir einfach, was du abfragen oder automatisieren möchtest — z. B. ein **DOIF**, **at**, **notify**, **watchdog** oder eine Geräteabfrage. Deine eigene OpenAI-kompatible URL & API-Key kannst du im Tab **API-Setup** verschlüsselt hinterlegen.',
      commandrefTopics: ['DOIF', 'at', 'notify', 'set_get'],
    },
  ]);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [runningCmdId, setRunningCmdId] = useState<string | null>(null);
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Commandref browser state
  const [refQuery, setRefQuery] = useState('');
  const [refCategory, setRefCategory] = useState<'Alle' | CommandrefEntry['category']>('Alle');

  // Setup draft state
  const [draft, setDraft] = useState<AiAssistantConfig>(aiConfig);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setupFeedback, setSetupFeedback] = useState<{ok: boolean; message: string} | null>(null);

  useEffect(() => {
    setDraft(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    if (subTab === 'chat') {
      chatEndRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
    }
  }, [messages.length, sending, subTab]);

  const endpointConfigured = isAiEndpointConfigured(aiConfig);

  const filteredCommandref = useMemo(() => {
    const base = refQuery.trim() ? searchCommandref(refQuery) : FHEM_COMMANDREF;
    if (refCategory === 'Alle') return base;
    return base.filter((entry) => entry.category === refCategory);
  }, [refQuery, refCategory]);

  const handleSend = async (promptOverride?: string) => {
    const text = (promptOverride ?? input).trim();
    if (!text || sending) return;

    const nowTime = new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: nowTime,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    const response = await sendAiAssistantMessage({
      prompt: text,
      history: messages.filter((m) => m.id !== 'welcome'),
      devices,
      config: aiConfig,
    });

    const assistantMsg: AiChatMessage = response.ok
      ? {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: response.content,
          timestamp: new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}),
          commands: response.commands,
          mode: response.mode,
          modelUsed: response.modelUsed,
          latencyMs: response.latencyMs,
          commandrefTopics: response.commandrefTopics,
        }
      : {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          content: `**Fehler bei der KI-Anfrage:** ${response.errorMessage || 'Unbekannter Fehler.'}\n\nPrüfe im Tab **API-Setup** die Basis-URL, den API-Key und den Modellnamen.`,
          timestamp: new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}),
          mode: 'openai',
        };

    setMessages((prev) => [...prev, assistantMsg]);
    setSending(false);
  };

  const handleRunCommandAction = async (msgId: string, action: AiCommandAction) => {
    setRunningCmdId(action.id);
    const res = await onExecuteAiCommand(action.command, action.requiresConfirm);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.commands) return m;
        return {
          ...m,
          commands: m.commands.map((c) =>
            c.id === action.id
              ? {
                  ...c,
                  executed: res.ok,
                  output: res.ok ? res.data || `Ausgeführt (${res.latencyMs} ms)` : undefined,
                  error: res.ok ? undefined : res.errorMessage || 'Abgebrochen oder fehlgeschlagen',
                }
              : c
          ),
        };
      })
    );
    setRunningCmdId(null);
  };

  const handleRunAllCommands = async (msgId: string, actions: AiCommandAction[]) => {
    for (const action of actions) {
      if (action.executed) continue;
      setRunningCmdId(action.id);
      const res = await onExecuteAiCommand(action.command, action.requiresConfirm);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.commands) return m;
          return {
            ...m,
            commands: m.commands.map((c) =>
              c.id === action.id
                ? {
                    ...c,
                    executed: res.ok,
                    output: res.ok ? res.data || `Ausgeführt (${res.latencyMs} ms)` : undefined,
                    error: res.ok ? undefined : res.errorMessage || 'Abgebrochen oder fehlgeschlagen',
                  }
                : c
            ),
          };
        })
      );
      setRunningCmdId(null);
      if (!res.ok) break;
    }
  };

  const handleCopyCommand = async (action: AiCommandAction) => {
    try {
      await navigator.clipboard.writeText(action.command);
      setCopiedCmdId(action.id);
      window.setTimeout(() => setCopiedCmdId(null), 1500);
    } catch {
      // ignore clipboard restriction
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
      transport: preset.transport,
    }));
    setSetupFeedback(null);
  };

  const handleTestSetup = async () => {
    setTesting(true);
    setSetupFeedback(null);
    const res = await testAiConnection(draft);
    setSetupFeedback({ok: res.ok, message: res.message});
    setTesting(false);
  };

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSaveAiConfig(draft);
    setSaving(false);
    setSetupFeedback({
      ok: true,
      message: 'KI-Endpunkt & API-Key verschlüsselt im lokalen Geräteschlüsselspeicher gesichert.',
    });
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="h-5 w-5 theme-text" />
            FHEM KI-Assistent
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            OpenAI-kompatible Automatisierungshilfe (DOIF, at, notify, define) mit integrierter FHEM Commandref
          </p>
        </div>

        <div className="inline-flex rounded-2xl border theme-surface p-1 self-start sm:self-auto">
          {(
            [
              {id: 'chat', label: 'KI-Chat', icon: MessageSquare},
              {id: 'commandref', label: 'Commandref', icon: BookOpen},
              {id: 'setup', label: 'API-Setup', icon: Sliders},
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'theme-btn-primary'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: CHAT */}
      {subTab === 'chat' && (
        <div className="space-y-4">
          {/* Active AI Engine Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border theme-surface px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  endpointConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {endpointConfigured
                  ? `OpenAI-API aktiv: ${aiConfig.model}`
                  : 'Lokaler FHEM-Helfer aktiv (Commandref + Live-Geräte)'}
              </span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {aiConfig.includeDeviceContext ? `${devices.length} Geräte im Kontext` : 'Gerätekontext aus'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!endpointConfigured && (
                <button
                  type="button"
                  onClick={() => setSubTab('setup')}
                  className="flex min-h-[34px] items-center gap-1.5 rounded-xl theme-tonal px-3 text-xs font-semibold hover:opacity-90"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Eigenen API-Key hinterlegen
                </button>
              )}
              {messages.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMessages((prev) => prev.slice(0, 1))}
                  className="flex min-h-[34px] items-center gap-1 rounded-xl theme-surface-alt px-2.5 text-xs font-medium text-slate-600 hover:opacity-85 dark:text-slate-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Leeren
                </button>
              )}
            </div>
          </div>

          {/* Starter Prompts */}
          {messages.length <= 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleSend(prompt)}
                  className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border theme-surface px-4 py-2.5 text-left text-xs font-medium text-slate-700 transition-colors hover:border-[var(--accent-ring)] dark:text-slate-200"
                >
                  <span className="leading-snug">{prompt}</span>
                  <Send className="h-3.5 w-3.5 shrink-0 theme-text" />
                </button>
              ))}
            </div>
          )}

          {/* Conversation Stream */}
          <div className="rounded-3xl border theme-surface p-4 sm:p-5 space-y-4 min-h-[340px] max-h-[58vh] overflow-y-auto">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[94%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-[13px] ${
                      isUser
                        ? 'theme-btn-primary rounded-br-md'
                        : 'theme-surface-alt border theme-border text-slate-800 dark:text-slate-200 rounded-bl-md'
                    }`}
                  >
                    {!isUser && (
                      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-semibold theme-text">
                          <Bot className="h-3.5 w-3.5" />
                          {msg.modelUsed || 'FHEM KI-Assistent'}
                        </span>
                        {msg.latencyMs !== undefined && (
                          <span className="font-mono tabular-nums">· {msg.latencyMs} ms</span>
                        )}
                        {msg.commandrefTopics && msg.commandrefTopics.length > 0 && (
                          <span className="truncate">
                            · Commandref: {msg.commandrefTopics.slice(0, 3).join(', ')}
                          </span>
                        )}
                      </div>
                    )}

                    <div className={isUser ? 'leading-relaxed' : ''}>
                      {isUser ? msg.content : renderFormattedText(msg.content)}
                    </div>

                    {/* Actionable FHEM Command Cards */}
                    {!isUser && msg.commands && msg.commands.length > 0 && (
                      <div className="mt-3 space-y-2 border-t theme-border pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Ausführbare FHEM-Befehle ({msg.commands.length})
                          </span>
                          {msg.commands.length > 1 && (
                            <button
                              type="button"
                              disabled={runningCmdId !== null}
                              onClick={() => void handleRunAllCommands(msg.id, msg.commands!)}
                              className="flex min-h-[34px] items-center gap-1.5 rounded-xl theme-btn-primary px-3 text-[11px] font-semibold disabled:opacity-50"
                            >
                              <PlayCircle className="h-3.5 w-3.5" />
                              Alle nacheinander ausführen
                            </button>
                          )}
                        </div>

                        {msg.commands.map((action) => {
                          const isBusy = runningCmdId === action.id;
                          return (
                            <div
                              key={action.id}
                              className="rounded-xl border theme-border bg-[var(--m3-surface)] p-3 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                  {action.requiresConfirm && (
                                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  )}
                                  <span>{action.label}</span>
                                  {action.requiresConfirm && (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      · Bestätigung aktiv
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleCopyCommand(action)}
                                    aria-label="Befehl kopieren"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg theme-surface-alt text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                  >
                                    {copiedCmdId === action.id ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleRunCommandAction(msg.id, action)}
                                    className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-colors ${
                                      action.executed
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'theme-tonal hover:opacity-90'
                                    }`}
                                  >
                                    {action.executed ? (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    ) : (
                                      <Play className="h-3.5 w-3.5" />
                                    )}
                                    {isBusy ? 'Läuft...' : action.executed ? 'Erneut senden' : 'Ausführen'}
                                  </button>
                                </div>
                              </div>

                              <code className="block break-all rounded-lg bg-[#0B0E14] px-3 py-2 font-mono text-[11px] text-emerald-300">
                                {action.command}
                              </code>

                              {action.output && (
                                <pre className="max-h-36 overflow-auto rounded-lg bg-emerald-500/10 px-3 py-2 font-mono text-[11px] text-emerald-800 dark:text-emerald-300 whitespace-pre-wrap">
                                  {action.output}
                                </pre>
                              )}
                              {action.error && (
                                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">
                                  {action.error}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <span className="mt-1 px-1 text-[10px] tabular-nums text-slate-400">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Sparkles className="h-4 w-4 animate-pulse theme-text" />
                <span>Analysiere FHEM Commandref & Live-Geräte...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-end gap-2 rounded-2xl border theme-surface p-2"
          >
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="z. B. Lege mir ein DOIF für Wohnzimmer Decke an, das um 20 Uhr angeht und um 22 Uhr wieder aus..."
              className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-12 min-w-[48px] items-center justify-center gap-1.5 rounded-xl theme-btn-primary px-4 text-xs font-semibold disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Senden</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: INTEGRATED FHEM COMMANDREF BROWSER */}
      {subTab === 'commandref' && (
        <div className="space-y-4">
          <div className="rounded-2xl border theme-surface p-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={refQuery}
                onChange={(e) => setRefQuery(e.target.value)}
                placeholder="FHEM Commandref durchsuchen (DOIF, at, notify, watchdog, appOptions, sunset, pct...)"
                className="min-h-[44px] w-full rounded-xl border theme-border bg-white pl-10 pr-4 text-sm text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['Alle', 'Automatisierung', 'Basisbefehle', 'Geräte & Module', 'Attribute & UI'] as const).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setRefCategory(cat)}
                    className={`min-h-[36px] rounded-xl px-3 text-xs font-semibold transition-colors ${
                      refCategory === cat
                        ? 'theme-btn-primary'
                        : 'theme-surface-alt text-slate-600 hover:opacity-85 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredCommandref.map((entry) => (
              <article key={entry.id} className="rounded-2xl border theme-surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider theme-text">
                      {entry.category}
                    </div>
                    <h3 className="mt-0.5 font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {entry.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSubTab('chat');
                      setInput(`Erkläre mir ${entry.id} und erstelle ein Beispiel für meine Geräte.`);
                    }}
                    className="shrink-0 min-h-[34px] rounded-xl theme-tonal px-2.5 text-[11px] font-semibold hover:opacity-90"
                  >
                    Mit KI nutzen
                  </button>
                </div>

                <code className="block break-all rounded-xl bg-[#0B0E14] px-3 py-2 font-mono text-[11px] text-sky-300">
                  {entry.syntax}
                </code>

                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {entry.summary}
                </p>

                <div className="space-y-1 border-t theme-border pt-2.5 text-xs text-slate-500 dark:text-slate-400">
                  {entry.details.split('\n').map((line, idx) => (
                    <p key={idx} className="leading-relaxed">
                      • {line}
                    </p>
                  ))}
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Beispiele
                  </div>
                  {entry.examples.map((ex, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-xl theme-surface-alt px-3 py-2"
                    >
                      <code className="break-all font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        {ex}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          setSubTab('chat');
                          setInput(`Passe diesen FHEM-Befehl an meine Geräte an: ${ex}`);
                        }}
                        className="shrink-0 text-[11px] font-semibold theme-text hover:underline"
                      >
                        Anpassen
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: OPENAI-COMPATIBLE API SETUP */}
      {subTab === 'setup' && (
        <form onSubmit={handleSaveSetup} className="space-y-4">
          {/* Provider Presets */}
          <div className="rounded-2xl border theme-surface p-5 space-y-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Anbieter-Vorlagen (OpenAI-kompatibel)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Wähle eine Vorlage oder gib eine beliebige eigene OpenAI-kompatible Basis-URL ein.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AI_PROVIDER_PRESETS.map((preset) => {
                const selected = draft.baseUrl.trim() === preset.baseUrl;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className={`flex flex-col items-start rounded-2xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-[var(--accent-ring)] theme-tonal'
                        : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-xs font-semibold">{preset.label}</span>
                    <span className="mt-0.5 text-[11px] opacity-75 line-clamp-2">{preset.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Endpoint Credentials & Parameters */}
          <div className="rounded-2xl border theme-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                API-Endpunkt & Zugangsdaten
              </h2>
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showKey ? 'Key verbergen' : 'Key anzeigen'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  OpenAI-kompatible Basis-URL
                </label>
                <input
                  type="url"
                  required
                  value={draft.baseUrl}
                  onChange={(e) => setDraft((p) => ({...p, baseUrl: e.target.value}))}
                  placeholder="https://api.openai.com/v1"
                  className="min-h-[44px] w-full rounded-xl border theme-border bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Modellname
                </label>
                <input
                  type="text"
                  required
                  value={draft.model}
                  onChange={(e) => setDraft((p) => ({...p, model: e.target.value}))}
                  placeholder="gpt-4o-mini, llama-3.3-70b-versatile, llama3.1:8b..."
                  className="min-h-[44px] w-full rounded-xl border theme-border bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  API-Key {draft.transport === 'direct' ? '(optional für Ollama/LM Studio)' : ''}
                </label>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={(e) => setDraft((p) => ({...p, apiKey: e.target.value}))}
                  placeholder="sk-..."
                  className="min-h-[44px] w-full rounded-xl border theme-border bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Verbindungsweg
                </label>
                <select
                  value={draft.transport}
                  onChange={(e) =>
                    setDraft((p) => ({...p, transport: e.target.value as 'proxy' | 'direct'}))
                  }
                  className="min-h-[44px] w-full rounded-xl border theme-border bg-white px-3 text-xs text-slate-900 dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                >
                  <option value="proxy">Server-Proxy (/api/ai/chat — ideal für Cloud-APIs)</option>
                  <option value="direct">Direktverbindung vom Browser (Ollama / LM Studio im LAN)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  <span>Temperatur (Präzision vs. Kreativität)</span>
                  <span className="font-mono tabular-nums">{draft.temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) => setDraft((p) => ({...p, temperature: Number(e.target.value)}))}
                  className="m3-slider w-full"
                  style={{
                    background: `linear-gradient(to right, var(--accent-primary) ${draft.temperature * 100}%, rgba(148,163,184,0.28) ${draft.temperature * 100}%)`,
                    borderRadius: '9999px',
                    height: '8px',
                  }}
                />
              </div>

              <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-2xl border theme-border theme-surface-alt px-4 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Live-Gerätekontext mitsenden
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Übergibt passende Gerätenamen, Readings & Commandref an die KI.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draft.includeDeviceContext}
                  onChange={(e) => setDraft((p) => ({...p, includeDeviceContext: e.target.checked}))}
                  className="h-5 w-5 rounded accent-[var(--accent-primary)]"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Zusätzliche System-Anweisungen (optional)
              </label>
              <textarea
                rows={2}
                value={draft.customSystemPrompt}
                onChange={(e) => setDraft((p) => ({...p, customSystemPrompt: e.target.value}))}
                placeholder="z. B. Benenne neue DOIFs immer mit Präfix di_ und füge room Automatisierung hinzu."
                className="w-full rounded-xl border theme-border bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
              />
            </div>

            {setupFeedback && (
              <div
                className={`flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs font-medium ${
                  setupFeedback.ok
                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/12 text-red-700 dark:text-red-300'
                }`}
              >
                {setupFeedback.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span>{setupFeedback.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={testing}
                onClick={() => void handleTestSetup()}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border theme-border theme-surface-alt px-4 text-xs font-semibold text-slate-800 hover:opacity-85 disabled:opacity-50 dark:text-slate-100"
              >
                <Wifi className={`h-4 w-4 ${testing ? 'animate-pulse' : ''}`} />
                {testing ? 'Teste Verbindung...' : 'Verbindung testen'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex min-h-[44px] items-center gap-2 rounded-xl theme-btn-primary px-5 text-xs font-semibold disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                {saving ? 'Speichere...' : 'Verschlüsselt speichern'}
              </button>
            </div>
          </div>

          {/* Security Info Card */}
          <div className="rounded-2xl border theme-surface p-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Verschlüsselte Key-Speicherung ({aiKeystoreEncrypted ? 'AES-256-GCM aktiv' : 'Basis-Modus'})
              </div>
              Dein API-Key wird lokal über den Web Crypto Geräteschlüsselspeicher verschlüsselt gespeichert, niemals in Logs geschrieben und ausschließlich an die von dir konfigurierte OpenAI-kompatible URL gesendet.
              {aiKeystoreUpdatedAt && (
                <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                  Zuletzt gespeichert: {new Date(aiKeystoreUpdatedAt).toLocaleString('de-DE')}
                </div>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
