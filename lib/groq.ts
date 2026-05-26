type GenerateGroqChatCompletionParams = {
  systemPrompt: string;
  userPrompt: string;
  model?: "text" | "fast";
};

export const GROQ_WHISPER_MODEL =
  process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3";

export async function generateGroqChatCompletion({
  systemPrompt,
  userPrompt,
  model,
}: GenerateGroqChatCompletionParams): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const selectedModel =
    model === "fast"
      ? process.env.GROQ_FAST_MODEL ??
        "meta-llama/llama-4-scout-17b-16e-instruct"
      : process.env.GROQ_TEXT_MODEL ?? "llama-3.3-70b-versatile";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Groq API request failed: ${JSON.stringify(payload)}`);
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Groq API response did not include message content");
  }

  return content;
}
