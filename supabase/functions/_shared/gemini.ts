const CATEGORIES = ['plumbing', 'electricity', 'cleanliness', 'internet'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface IntakeResult {
  ai_available: boolean;
  summary?: string;
  suggested_category?: Category;
  confidence?: number;
  missing_information?: string[];
  follow_up_questions?: string[];
  extracted_location?: string;
  extracted_details?: Record<string, string>;
  category_reasoning?: string;
  duplicate_hint?: string;
  error?: string;
}

export function geminiConfigured(): boolean {
  return !!Deno.env.get('GEMINI_API_KEY');
}

const PROMPT = `You are the intake assistant for Campflow, a campus facility complaint system.
Analyze the student's complaint report (and photo, if provided) and return ONLY a JSON object with:
- "summary": one-sentence factual summary of the reported problem (<= 40 words).
- "suggested_category": exactly one of "plumbing" | "electricity" | "cleanliness" | "internet".
- "confidence": number 0..1 for the category suggestion.
- "missing_information": array of short strings naming useful details that are absent (e.g. "floor number", "when it started"). Empty if sufficient.
- "follow_up_questions": array of up to 3 short targeted questions to ask the student. Empty if sufficient.
- "extracted_location": normalized location string (building / floor / room) or "".
- "extracted_details": object of any other structured facts (e.g. {"severity": "...", "duration": "..."}).
- "category_reasoning": one sentence explaining the category suggestion.
Rules:
- Do not invent facts. If information is missing, list it instead of guessing.
- A photo can support a report but never proves a fault; do not overstate certainty.
- Pick the best category even at low confidence; explain reasoning honestly.
Return JSON only, no markdown fences.`;

function parseIntake(text: string): IntakeResult {
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  const cat = String(parsed.suggested_category || '').toLowerCase();
  return {
    ai_available: true,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    suggested_category: (CATEGORIES as readonly string[]).includes(cat) ? (cat as Category) : undefined,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
    missing_information: Array.isArray(parsed.missing_information) ? parsed.missing_information.map(String).slice(0, 6) : [],
    follow_up_questions: Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions.map(String).slice(0, 3) : [],
    extracted_location: typeof parsed.extracted_location === 'string' ? parsed.extracted_location : '',
    extracted_details: typeof parsed.extracted_details === 'object' && parsed.extracted_details ? parsed.extracted_details : {},
    category_reasoning: typeof parsed.category_reasoning === 'string' ? parsed.category_reasoning : '',
  };
}

export async function runIntake(opts: {
  title: string;
  description: string;
  location: string;
  imageBase64?: string | null;
  imageMime?: string | null;
}): Promise<IntakeResult> {
  const userText = `Complaint title: ${opts.title}\nDescription: ${opts.description}\nReported location: ${opts.location || '(not provided)'}`;

  // Groq first (text-only); photos go straight to Gemini's multimodal endpoint.
  if (!opts.imageBase64 && Deno.env.get('GROQ_API_KEY')) {
    try {
      const { aiJson } = await import('./ai.ts');
      const r = await aiJson({ system: PROMPT, user: userText, temperature: 0.2 });
      if (r.ok && r.text) return parseIntake(r.text);
    } catch { /* fall through to Gemini */ }
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return { ai_available: false, error: 'no AI provider configured' };
  }
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: unknown[] = [
    {
      text: `${PROMPT}\n\n${userText}`,
    },
  ];
  if (opts.imageBase64 && opts.imageMime) {
    parts.push({ inline_data: { mime_type: opts.imageMime, data: opts.imageBase64 } });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      return { ai_available: false, error: `gemini ${res.status}: ${body.slice(0, 300)}` };
    }

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('');
    if (!text) return { ai_available: false, error: 'empty gemini response' };

    return parseIntake(text);
  } catch (e) {
    return { ai_available: false, error: `gemini request failed: ${(e as Error).message}` };
  }
}
