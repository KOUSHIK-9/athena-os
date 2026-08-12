export { runScenario, runConformance, runParity } from './conformance/harness.js';
export type { ScenarioResult, ConformanceReport } from './conformance/harness.js';
export type { ConformanceScenario, ConformanceLayer } from './conformance/scenario.js';
export { parityScenarios } from './conformance/fixtures/parity.js';
export { behavioralScenarios } from './conformance/fixtures/behavioral.js';
export { DeterministicReasoningBackend } from './deterministic/index.js';
export { LlmReasoningBackend } from './llm/LlmReasoningBackend.js';
export type { ModelClient, ExtractedGoal, ModelExtraction } from './llm/modelClient.js';
export { StubModelClient } from './llm/stubModelClient.js';
export { OpenAIModelClient } from './openai/openAiModelClient.js';
export { OpenAICompatibleHttpProvider } from './openai/openAiHttpProvider.js';
export { OpenAIError } from './openai/openAiHttpProvider.js';
export { AppleModelClient, AppleModelUnavailableError } from './apple/appleModelClient.js';
export {
  AppleModelConfigSchema,
  appleModelConfigFromEnv,
  parseAppleModelConfig,
} from './apple/appleModelConfig.js';
export { AppleBridgeError } from './apple/appleModelBridge.js';
export { SYSTEM_PROMPT } from './llm/goalPrompt.js';
export type {
  ChatCompletionProvider,
  ChatCompletionRequest,
  ChatMessage,
} from './openai/chatCompletionProvider.js';
export {
  OpenAIConfigSchema,
  openAIConfigFromEnv,
  parseOpenAIConfig,
} from './openai/openAiConfig.js';
export type { OpenAIConfig } from './openai/openAiConfig.js';
export type { ReasoningBackend, ReasoningBackendResult } from '@athena-os/reasoning';
