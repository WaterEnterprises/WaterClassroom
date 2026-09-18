import { Hono } from "hono";
import { getGenAI } from "../ai";
import { chatCompletion, isOpenAIConfigured, getAIModel } from "../openai";

export const aiRoutes = new Hono();

const TUTOR_SYSTEM = (lessonContext: string) =>
  `You are the authorized "Water Classroom" 24/7 AI tutor. Guide students on home-school curricula following first-principles: Individual Sovereignty, Wealth Creation (Do Good, Make Money, Have Fun), Universal Standard of Morality, Structural Incentive Engineering, and Post-Scarcity Automation. Adopt a friendly, professional Swiss/Modern academic tone. Use Socratic inquiry. Align with: ${lessonContext}. Respond in clean Markdown.`;

async function runTutoring(messages: any[], selectedLessonContext: string): Promise<{ text: string; provider: string }> {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw Object.assign(new Error("Messages required"), { status: 400 });
  }
  const system = TUTOR_SYSTEM(selectedLessonContext || "General Curriculum Track");
  const history = messages.map((m: any) => ({
    role: m.sender === "student" ? "user" : "assistant",
    content: String(m.text || ""),
  })).filter((m: any) => m.content.trim());

  // 1. OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, vLLM…).
  if (isOpenAIConfigured()) {
    try {
      const text = await chatCompletion([{ role: "system", content: system }, ...history]);
      return { text, provider: `openai:${getAIModel()}` };
    } catch (err: any) {
      // Fall through to Gemini before giving up.
      console.warn("OpenAI-compatible tutor failed, trying Gemini:", err.message);
    }
  }

  // 2. Gemini fallback.
  const ai = getGenAI();
  if (ai) {
    const promptText = history.length > 0 ? history[history.length - 1].content : "";
    const historyText = history.slice(0, -1).map((m: any) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: `${system}\n\nHistory:\n${historyText}\n\nLatest query:\n${promptText}` }] }],
    });
    if (response.text?.trim()) return { text: response.text.trim(), provider: "gemini" };
  }

  throw Object.assign(new Error("AI tutor is unavailable — set AI_API_KEY (OpenAI-compatible) or GEMINI_API_KEY."), { status: 503 });
}

// Canonical tutor endpoint.
aiRoutes.post("/ai/tutor", async (c) => {
  try {
    const body = await c.req.json();
    const result = await runTutoring(body.messages, body.selectedLessonContext);
    return c.json({ text: result.text, provider: result.provider });
  } catch (error: any) {
    return c.json({ error: "Tutor error", details: error.message }, error.status || 500);
  }
});

// Legacy alias (older frontend builds call this path).
aiRoutes.post("/gemini/tutoring", async (c) => {
  try {
    const body = await c.req.json();
    const result = await runTutoring(body.messages, body.selectedLessonContext);
    return c.json({ text: result.text, provider: result.provider });
  } catch (error: any) {
    return c.json({ error: "Tutor error", details: error.message }, error.status || 500);
  }
});
