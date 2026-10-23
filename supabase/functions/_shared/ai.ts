// Shared AI provider helpers — Groq first, Gemini fallback.
// Groq uses the OpenAI-compatible chat completions API; Gemini uses
// generateContent. Providers report which model actually answered so the
// caller can persist an honest model_identifier.

export function aiConfigured(): boolean {
  return Boolean(Deno.env.get('GROQ_API_KEY') || Deno.env.get('GEMINI_API_KEY'));
}

export interface AiJsonResult {
  ok: boolean;
  provider: 'groq' | 'gemini' | null;
  model: string | null;
  text: string | null;
  error: string | null;
  status: number;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface GroqToolDecl {
  type: 'function';
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

export interface GroqReply {
  ok: boolean;
  text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  error: string | null;
  status: number;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function groqModel(): string {
  return Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';
}

/** One Groq chat-completion call. */
export async function groqCall(opts: {
  messages: GroqMessage[];
  json?: boolean;
  temperature?: number;
  tools?: GroqToolDecl[];
  timeoutMs?: number;
}): Promise<GroqReply> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return { ok: false, text: '', toolCalls: [], error: 'GROQ_API_KEY is not configured', status: 503 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 22000);
  try {
    const body: Record<string, unknown> = {
      model: groqModel(),
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    if (opts.tools?.length) { body.tools = opts.tools; body.tool_choice = 'auto'; }
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).replaceAll(apiKey, '[redacted]').slice(0, 220);
      return { ok: false, text: '', toolCalls: [], error: `groq ${res.status}: ${detail}`, status: res.status === 429 ? 429 : 502 };
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    const toolCalls = (msg?.tool_calls ?? [])
      .filter((c: { function?: { name?: string } }) => c?.function?.name)
      .map((c: { id: string; function: { name: string; arguments?: string } }) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.function.arguments ?? '{}'); } catch { /* empty args */ }
        return { id: c.id, name: c.function.name, args };
      });
    return { ok: true, text: (msg?.content ?? '').trim(), toolCalls, error: null, status: 200 };
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    return { ok: false, text: '', toolCalls: [], error: aborted ? 'Groq took too long' : `groq request failed: ${(e as Error).message}`, status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-text JSON call: Groq first, then Gemini generateContent as fallback. */
export async function aiJson(opts: {
  system: string;
  user: string;
  temperature?: number;
  imageBase64?: string | null;
  imageMime?: string | null;
  timeoutMs?: number;
}): Promise<AiJsonResult> {
  // Images: Groq's tool-use models don't take image_url reliably here, so when a
  // photo is attached we go straight to Gemini's multimodal endpoint.
  if (!opts.imageBase64 && Deno.env.get('GROQ_API_KEY')) {
    const r = await groqCall({
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      json: true,
      temperature: opts.temperature,
      timeoutMs: opts.timeoutMs,
    });
    if (r.ok && r.text) {
      return { ok: true, provider: 'groq', model: groqModel(), text: r.text, error: null, status: 200 };
    }
    // Fall through to Gemini on any Groq failure.
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return { ok: false, provider: null, model: null, text: null, error: 'no AI provider configured', status: 503 };
  }
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const parts: unknown[] = [{ text: `${opts.system}\n\n${opts.user}` }];
  if (opts.imageBase64 && opts.imageMime) {
    parts.push({ inline_data: { mime_type: opts.imageMime, data: opts.imageBase64 } });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 22000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: opts.temperature ?? 0.2, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).replaceAll(apiKey, '[redacted]').slice(0, 220);
      return { ok: false, provider: 'gemini', model, text: null, error: `gemini ${res.status}: ${detail}`, status: res.status === 429 ? 429 : 502 };
    }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('').trim();
    if (!text) return { ok: false, provider: 'gemini', model, text: null, error: 'empty gemini response', status: 502 };
    return { ok: true, provider: 'gemini', model, text, error: null, status: 200 };
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    return { ok: false, provider: 'gemini', model, text: null, error: aborted ? 'gemini took too long' : `gemini request failed: ${(e as Error).message}`, status: 502 };
  } finally {
    clearTimeout(timer);
  }
}
