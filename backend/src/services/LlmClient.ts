/**
 * Abstraction over "call an LLM, get text back". AnalysisService depends only
 * on this interface, never on the Anthropic SDK directly — this is what makes
 * the provider swappable/mockable (see MockLlmClient, used automatically when
 * no ANTHROPIC_API_KEY is configured, and in tests).
 */
export interface LlmClient {
  /**
   * @param systemPrompt strict instructions, including the required JSON schema
   * @param userPrompt the constructed prompt containing document context + user's analysis request
   * @returns raw text response — the caller is responsible for JSON parsing/validation
   */
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}
