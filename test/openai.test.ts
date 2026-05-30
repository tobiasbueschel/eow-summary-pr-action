import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSummary } from "../src/openai.js";

describe("generateSummary", () => {
  it("extracts output text from a Responses API message", async () => {
    const calls: unknown[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "Weekly summary"
                }
              ]
            }
          ]
        }),
        { status: 200 }
      );
    };

    const summary = await generateSummary({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
      systemPrompt: "Summarize.",
      prompt: "Activity",
      timeoutMs: 1000,
      fetchImpl
    });

    assert.equal(summary, "Weekly summary");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      model: "gpt-5.4-mini",
      instructions: "Summarize.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Activity"
            }
          ]
        }
      ],
      max_output_tokens: 2200,
      store: false
    });
  });

  it("surfaces OpenAI API errors", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Bad key" } }), { status: 401 });

    await assert.rejects(
      () =>
        generateSummary({
          apiKey: "bad-key",
          model: "gpt-5.4-mini",
          systemPrompt: "Summarize.",
          prompt: "Activity",
          timeoutMs: 1000,
          fetchImpl
        }),
      /OpenAI request failed with 401: Bad key/
    );
  });
});
