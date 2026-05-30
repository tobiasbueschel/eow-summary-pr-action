export interface GenerateSummaryInput {
  apiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface ResponseContent {
  type?: string;
  text?: string;
}

interface ResponseOutputItem {
  type?: string;
  content?: ResponseContent[];
}

interface ResponsesApiBody {
  output_text?: string;
  output?: ResponseOutputItem[];
  error?: {
    message?: string;
  };
}

export async function generateSummary(input: GenerateSummaryInput): Promise<string> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.systemPrompt,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: input.prompt
              }
            ]
          }
        ],
        max_output_tokens: 2200,
        store: false
      }),
      signal: controller.signal
    });

    const text = await response.text();
    const body = parseResponseBody(text);

    if (!response.ok) {
      const message = body?.error?.message ?? text;
      throw new Error(`OpenAI request failed with ${response.status}: ${message}`);
    }

    const summary = extractOutputText(body);
    if (!summary) {
      throw new Error("OpenAI response did not contain output text.");
    }

    return summary;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${input.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseResponseBody(text: string): ResponsesApiBody | undefined {
  try {
    return JSON.parse(text) as ResponsesApiBody;
  } catch {
    return undefined;
  }
}

function extractOutputText(body: ResponsesApiBody | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim() || undefined;
}
