/**
 * ChatCompletions provider seam (RFC-0012 §Reference Implementation).
 *
 * The ReasoningBackend port (`ModelClient`) is synchronous; an HTTP call is
 * not. This seam owns the network detail so `OpenAIModelClient` can stay a
 * synchronous, dependency-free drop-in `ModelClient`, and so the provider
 * can be faked in tests (no live API calls) and swapped for an SDK-driven
 * implementation later without touching the client.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  /**
   * Token accounting for the call, when the provider reports it. Absent
   * when the transport never saw a usage payload (e.g. a test fake or a
   * non-conforming endpoint) — benchmark tools treat it as `0/0`, never a
   * fabricated number.
   */
  usage?: ChatCompletionUsage;
}

export interface ChatCompletionProvider {
  readonly id: string;
  /**
   * Returns the assistant message content for a Chat Completions request,
   * plus token usage when the API reported it. Synchronous by design (see
   * module doc) — the default implementation is an OpenAI-compatible HTTP
   * transport; tests inject a fake.
   */
  complete(request: ChatCompletionRequest): ChatCompletionResult;
}
