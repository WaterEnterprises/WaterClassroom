// ─── OpenAI-compatible chat client (no SDK needed) ───
// Works with OpenAI, OpenRouter, Together, Groq, Ollama, vLLM, etc.
// Env: AI_API_KEY (required), AI_BASE_URL (default https://api.openai.com/v1),
//      AI_MODEL (default gpt-4o-mini).

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export function isOpenAIConfigured(): boolean {
  const key = String(process.env.AI_API_KEY || "").trim();
  return !!key && key !== "MY_AI_API_KEY";
}

export function getAIBaseUrl(): string {
  return String(process.env.AI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
}

export function getAIModel(): string {
  return String(process.env.AI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

export async function chatCompletion(messages: ChatMsg[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const apiKey = String(process.env.AI_API_KEY || "").trim();
  if (!apiKey) throw new Error("AI_API_KEY not configured.");
  const url = `${getAIBaseUrl()}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getAIModel(),
        messages,
        max_tokens: opts?.maxTokens ?? 1024,
        temperature: opts?.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.error?.message || (data as any)?.error || `AI request failed (${res.status})`;
      throw new Error(typeof msg === "string" ? msg : `AI request failed (${res.status})`);
    }
    const text = (data as any)?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error("AI returned an empty response.");
    return String(text).trim();
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("AI request timed out after 60s.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
