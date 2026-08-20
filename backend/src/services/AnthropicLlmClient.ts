import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "./LlmClient";
import { LlmError } from "../errors";
import { config } from "../config";

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string = config.anthropicApiKey, model: string = config.llmModel) {
    if (!apiKey) {
      throw new LlmError("ANTHROPIC_API_KEY is not configured.");
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new LlmError("LLM response contained no text content.");
      }
      return textBlock.text;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError(`LLM request failed: ${(err as Error).message}`);
    }
  }
}
