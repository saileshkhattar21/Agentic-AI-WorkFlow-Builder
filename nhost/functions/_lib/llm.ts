// nhost/functions/_lib/llm.ts

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export async function callGemini(prompt: string): Promise<string> {
  // Function name kept as callGemini to avoid touching engine.ts's import —
  // it's calling Groq under the hood now.
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Groq response missing text: " + JSON.stringify(data));
  }
  return text;
}