import { Groq } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ALLOWED_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "deepseek-r1-distill-llama-70b",
]);

export default async function handler(req, res) {
  // Basic request logging for easier debugging in dev
  console.log('[api/chat] incoming', { method: req.method, url: req.url, hasKey: !!process.env.GROQ_API_KEY });
  if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed." });

  // Informative response when the Groq API key is missing
  if (!process.env.GROQ_API_KEY) {
    console.error('[api/chat] missing GROQ_API_KEY');
    return res.status(503).json({ reply: 'GROQ_API_KEY is not configured. Set it in .env (local) or Vercel Environment Variables (production).' });
  }

  try {
    const { message, history = [], model: requestedModel, currentDateTime } = req.body;

    if (!message || typeof message !== "string" || !message.trim())
      return res.status(400).json({ reply: "Message cannot be empty." });

    const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : "llama-3.3-70b-versatile";

    // Use the date/time sent by the browser — always accurate
    const dateTimeContext = currentDateTime
      ? `The current date and time is: ${currentDateTime}`
      : `The current date and time is: ${new Date().toUTCString()}`;

    const systemPrompt = `You are ALGO Academy, an elite Data Structures & Algorithms tutor.

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
    // Log full error server-side for debugging
    console.error('[api/chat] Groq API error:', error && (error.stack || error));

    // If Groq provided an HTTP status, forward it where appropriate
    if (error && error.status) {
      const msg = error?.error?.error?.message || error.message || 'Groq API error';
      return res.status(error.status).json({ reply: msg });
    }

    // Development: expose stack for quick debugging; Production: generic message
    const generic = '⚠️ **Service error.** Something went wrong — please try again in a moment.';
    const reply = (process.env.NODE_ENV !== 'production') ? (error && (error.message || String(error)) || generic) : generic;
    const status = error && error.status ? error.status : 500;
    return res.status(status).json({ reply, ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}) });
  }
}