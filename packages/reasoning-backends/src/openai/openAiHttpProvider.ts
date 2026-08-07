import { execFileSync } from 'node:child_process';
import type { OpenAIConfig } from './openAiConfig.js';
import type { ChatCompletionProvider, ChatCompletionRequest } from './chatCompletionProvider.js';

/**
 * OpenAI-compatible HTTP transport for the `ChatCompletionProvider` seam.
 *
 * The `ModelClient` port is synchronous (RFC-0012), so the HTTP call runs
 * in a short-lived child Node process via `execFileSync` (stdlib only, no
 * new dependencies): the parent blocks, the child does `fetch`, and the
 * result crosses back over stdout as a single JSON envelope. The child is
 * killed by `execFileSync`'s timeout option, which is how the configured
 * timeout is enforced.
 *
 * This transport talks to any OpenAI-compatible Chat Completions endpoint
 * (`baseUrl`), not only api.openai.com.
 */

const WORKER = `
const readAll = () => new Promise((resolve, reject) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', reject);
});
const main = async () => {
  const input = JSON.parse(await readAll());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + input.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      console.log(JSON.stringify({ ok: false, httpStatus: response.status, error: text.slice(0, 500) }));
      return;
    }
    console.log(JSON.stringify({ ok: true, content: text }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
  } finally {
    clearTimeout(timer);
  }
};
main();
`;

export class OpenAIError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'OpenAIError';
    this.code = code;
  }
}

export class OpenAICompatibleHttpProvider implements ChatCompletionProvider {
  readonly id = 'openai-http';

  constructor(private readonly config: OpenAIConfig) {}

  complete(request: ChatCompletionRequest): string {
    const payload = {
      url: `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      apiKey: this.config.apiKey,
      timeoutMs: this.config.timeoutMs,
      body: {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
      },
    };

    let stdout: string;
    try {
      stdout = execFileSync(process.execPath, ['--input-type=module', '-e', WORKER], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        timeout: this.config.timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new OpenAIError(
        detail.includes('ETIMEDOUT') ? 'TIMEOUT' : 'TRANSPORT',
        `OpenAI transport failed: ${detail}`
      );
    }

    const envelope = JSON.parse(stdout) as {
      ok?: boolean;
      content?: string;
      httpStatus?: number;
      error?: string;
    };
    if (!envelope.ok) {
      throw new OpenAIError(
        'API',
        envelope.httpStatus
          ? `OpenAI API error (HTTP ${envelope.httpStatus}): ${envelope.error}`
          : `OpenAI API error: ${envelope.error}`
      );
    }

    return extractAssistantContent(envelope.content ?? '');
  }
}

function extractAssistantContent(raw: string): string {
  let parsed: { choices?: Array<{ message?: { content?: string } }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  return parsed.choices?.[0]?.message?.content ?? raw;
}
