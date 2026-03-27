import { Groq } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ALLOWED_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "deepseek-r1-distill-llama-70b",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed." });

  try {
    const { message, history = [], model: requestedModel, currentDateTime } = req.body;

    if (!message || typeof message !== "string" || !message.trim())
      return res.status(400).json({ reply: "Message cannot be empty." });

    const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : "llama-3.3-70b-versatile";

    // Use the date/time sent by the browser — always accurate
    const dateTimeContext = currentDateTime
      ? `The current date and time is: ${currentDateTime}`
      : `The current date and time is: ${new Date().toUTCString()}`;

    const systemPrompt = `You are DSA.ai, an elite Data Structures & Algorithms tutor.

## Real-World Context
${dateTimeContext}
Always use this when the user asks about the current date, time, or anything time-related. Never say you don't have access to the current date — you do, it is provided above.

## Core Rules
- Answer ALL questions about DSA, algorithms, complexity, and coding interviews
- Use **bold** for key terms and algorithm names
- Include working code in fenced blocks: \`\`\`python, \`\`\`javascript, etc.
- Always analyse time and space complexity with exact Big O notation
- Structure answers: intuition → approach → code → complexity
- For non-DSA questions, answer helpfully but briefly, then redirect to DSA topics
- End responses with a natural follow-up question or suggestion`;

    const safeHistory = Array.isArray(history)
      ? history.slice(-12).filter(m => m?.role && m?.content).map(m => ({
          role: m.role === "user" ? "user" : "assistant",
          content: String(m.content).slice(0, 2000),
        }))
      : [];

    const completion = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: message.trim() },
      ],
      temperature: 0.15,
      max_tokens: 2048,
    });

    const reply = completion.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";
    return res.status(200).json({ reply, model });

  } catch (error) {
    console.error("Groq API error:", error);
    const reply = error?.status === 429
      ? "⚠️ **Rate limit reached.** Please wait a moment and try again."
      : "⚠️ **Service error.** Something went wrong — please try again in a moment.";
    return res.status(500).json({ reply });
  }
}