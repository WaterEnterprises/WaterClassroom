import { Hono } from "hono";
import { getGenAI } from "../ai";

export const aiRoutes = new Hono();

aiRoutes.post("/gemini/tutoring", async (c) => {
  try {
    const body = await c.req.json();
    const { messages, selectedLessonContext } = body;
    if (!messages || !Array.isArray(messages)) return c.json({ error: "Messages required" }, 400);

    const promptText = messages[messages.length - 1].text;
    const historyText = messages.slice(0, -1).map((m: any) => `${m.sender === "student" ? "Student" : "Tutor"}: ${m.text}`).join("\n");

    const systemInstruction = `You are the authorized "Water Classroom" 24/7 AI tutor. Guide students on home-school curricula following first-principles: Individual Sovereignty, Wealth Creation (Do Good, Make Money, Have Fun), Universal Standard of Morality, Structural Incentive Engineering, and Post-Scarcity Automation. Adopt a friendly, professional Swiss/Modern academic tone. Use Socratic inquiry. Align with: ${selectedLessonContext || "General Curriculum Track"}. Respond in clean Markdown.`;

    const ai = getGenAI();
    if (!ai) {
      return c.json({ error: "GEMINI_API_KEY not configured. AI tutor is unavailable." }, 503);
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\nHistory:\n${historyText}\n\nLatest query:\n${promptText}` }] }],
    });
    return c.json({ text: response.text || "I apologize, let's explore this again." });
  } catch (error: any) {
    return c.json({ error: "Tutor error", details: error.message }, 500);
  }
});
