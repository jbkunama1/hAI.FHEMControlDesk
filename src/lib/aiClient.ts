import type {AiAssistantConfig, AiChatMessage, AiCommandAction, FhemDevice} from '../types/fhem';
import {
  buildFhemAiSystemPrompt,
  extractFhemCommandsFromReply,
  runLocalFhemAssistantFallback,
} from './fhemCommandref';
import {getActiveSessionToken} from './profileClient';

export interface AiProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  transport: 'proxy' | 'direct';
  requiresKey: boolean;
  hint: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    transport: 'proxy',
    requiresKey: true,
    hint: 'Offizielle OpenAI API (gpt-4o-mini, gpt-4o, o3-mini)',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    transport: 'proxy',
    requiresKey: true,
    hint: 'Ein Key für viele Modelle (Claude, GPT, Llama, Mistral)',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    transport: 'proxy',
    requiresKey: true,
    hint: 'Sehr schnelle Open-Weight-Modelle (Llama 3.3, Qwen)',
  },
  {
    id: 'ollama',
    label: 'Ollama (LAN)',
    baseUrl: 'http://192.168.178.50:11434/v1',
    defaultModel: 'llama3.1:8b',
    transport: 'direct',
    requiresKey: false,
    hint: 'Lokaler KI-Server im Heimnetz (Direktverbindung, CORS aktivieren)',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (LAN)',
    baseUrl: 'http://192.168.178.50:1234/v1',
    defaultModel: 'local-model',
    transport: 'direct',
    requiresKey: false,
    hint: 'Lokaler OpenAI-Server über LM Studio im LAN',
  },
  {
    id: 'custom',
    label: 'Benutzerdefiniert',
    baseUrl: 'https://api.example.com/v1',
    defaultModel: 'gpt-4o-mini',
    transport: 'proxy',
    requiresKey: true,
    hint: 'Jeder beliebige OpenAI-kompatible /v1/chat/completions Endpunkt',
  },
];

export interface AiChatResponse {
  ok: boolean;
  content: string;
  commands: AiCommandAction[];
  mode: 'openai' | 'local_helper';
  modelUsed?: string;
  latencyMs: number;
  commandrefTopics: string[];
  errorMessage?: string;
}

export function isAiEndpointConfigured(config: AiAssistantConfig): boolean {
  const hasUrl = Boolean(config.baseUrl.trim());
  const hasModel = Boolean(config.model.trim());
  if (!hasUrl || !hasModel) return false;
  // Direct LAN servers (Ollama / LM Studio) often work without an API key
  if (config.transport === 'direct') return true;
  return Boolean(config.apiKey.trim());
}

async function callOpenAiCompatible(
  config: AiAssistantConfig,
  messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>,
  timeoutMs = 45000
): Promise<{ok: true; content: string; model: string; latencyMs: number} | {ok: false; message: string; latencyMs: number}> {
  const started = performance.now();

  if (config.transport === 'direct') {
    const normalizedBase = config.baseUrl.trim().replace(/\/+$/, '');
    const endpoint = normalizedBase.endsWith('/chat/completions')
      ? normalizedBase
      : `${normalizedBase}/chat/completions`;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (config.apiKey.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model.trim(),
          messages,
          temperature: config.temperature,
        }),
        signal: controller.signal,
      });
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      const raw = await res.text();
      let parsed: {
        choices?: Array<{message?: {content?: string}}>;
        model?: string;
        error?: {message?: string};
      } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          message:
            parsed?.error?.message ||
            `Lokaler KI-Endpunkt antwortete mit HTTP ${res.status}.`,
        };
      }
      const content = parsed?.choices?.[0]?.message?.content || '';
      if (!content.trim()) {
        return {ok: false, latencyMs, message: 'KI-Endpunkt hat keine Textantwort geliefert.'};
      }
      return {ok: true, content, model: parsed?.model || config.model.trim(), latencyMs};
    } catch (err: unknown) {
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {ok: false, latencyMs, message: 'Zeitüberschreitung bei der lokalen KI-Anfrage.'};
      }
      return {
        ok: false,
        latencyMs,
        message:
          'Direktverbindung zum KI-Endpunkt fehlgeschlagen (Host nicht erreichbar oder CORS auf Ollama/LM Studio nicht aktiviert).',
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  // Server-side proxy (/api/ai/chat) for cloud OpenAI-compatible APIs
  try {
    const sessionToken = getActiveSessionToken();
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'FHEM-Control-Desk',
        ...(sessionToken ? {'X-Session-Token': sessionToken} : {}),
      },
      body: JSON.stringify({
        baseUrl: config.baseUrl.trim(),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
        messages,
        temperature: config.temperature,
        timeoutMs,
      }),
    });

    const json = (await response.json()) as {
      ok: boolean;
      content?: string;
      model?: string;
      latencyMs?: number;
      message?: string;
    };
    const latencyMs = json.latencyMs ?? Math.max(1, Math.round(performance.now() - started));

    if (!json.ok || !json.content) {
      return {
        ok: false,
        latencyMs,
        message: json.message || 'Anfrage an den OpenAI-kompatiblen Endpunkt fehlgeschlagen.',
      };
    }

    return {
      ok: true,
      content: json.content,
      model: json.model || config.model.trim(),
      latencyMs,
    };
  } catch {
    return {
      ok: false,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      message: 'Backend-Proxy (/api/ai/chat) nicht erreichbar.',
    };
  }
}

export async function sendAiAssistantMessage(params: {
  prompt: string;
  history: AiChatMessage[];
  devices: FhemDevice[];
  config: AiAssistantConfig;
}): Promise<AiChatResponse> {
  const {prompt, history, devices, config} = params;
  const started = performance.now();

  if (!isAiEndpointConfigured(config)) {
    const local = runLocalFhemAssistantFallback(prompt, devices);
    return {
      ok: true,
      content: local.content,
      commands: local.commands,
      mode: 'local_helper',
      modelUsed: 'Lokaler FHEM-Helfer + Commandref',
      latencyMs: Math.max(12, Math.round(performance.now() - started)),
      commandrefTopics: local.commandrefTopics,
    };
  }

  const {systemPrompt, matchedCommandref} = buildFhemAiSystemPrompt(
    prompt,
    devices,
    config.includeDeviceContext,
    config.customSystemPrompt
  );

  const conversationHistory = history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const apiResult = await callOpenAiCompatible(config, [
    {role: 'system', content: systemPrompt},
    ...conversationHistory,
    {role: 'user', content: prompt},
  ]);

  if (!apiResult.ok) {
    return {
      ok: false,
      content: '',
      commands: [],
      mode: 'openai',
      latencyMs: apiResult.latencyMs,
      commandrefTopics: matchedCommandref.map((c) => c.id),
      errorMessage: apiResult.message,
    };
  }

  const commands = extractFhemCommandsFromReply(apiResult.content);
  return {
    ok: true,
    content: apiResult.content,
    commands,
    mode: 'openai',
    modelUsed: apiResult.model,
    latencyMs: apiResult.latencyMs,
    commandrefTopics: matchedCommandref.map((c) => c.id),
  };
}

export async function testAiConnection(
  config: AiAssistantConfig
): Promise<{ok: boolean; message: string; latencyMs: number; model?: string}> {
  if (!config.baseUrl.trim() || !config.model.trim()) {
    return {
      ok: false,
      latencyMs: 0,
      message: 'Bitte Basis-URL und Modellname ausfüllen.',
    };
  }
  const result = await callOpenAiCompatible(
    config,
    [
      {role: 'system', content: 'Antworte kurz mit exakt: FHEM KI bereit.'},
      {role: 'user', content: 'Verbindungstest'},
    ],
    20000
  );
  if (result.ok) {
    return {
      ok: true,
      latencyMs: result.latencyMs,
      model: result.model,
      message: `Verbindung erfolgreich (${result.model}, ${result.latencyMs} ms).`,
    };
  }
  return {
    ok: false,
    latencyMs: result.latencyMs,
    message: result.message,
  };
}
