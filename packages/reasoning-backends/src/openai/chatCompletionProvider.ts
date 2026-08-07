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

export interface ChatCompletionProvider {
  readonly id: string;
  /**
   * Returns the assistant message content for a Chat Completions request.
   * Synchronous by design (see module doc) — the default implementation is
   * an OpenAI-compatible HTTP provider; tests inject a fake.
   */
  complete(request: ChatCompletionRequest): string;
}
