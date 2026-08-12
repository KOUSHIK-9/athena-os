import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@athena-os/shared';
import { mcpSessionManager } from './sessionManager.js';
import {
  ConnectParamsSchema,
  LaunchAppParamsSchema,
  TapParamsSchema,
  TypeParamsSchema,
  SwipeParamsSchema,
  TerminateAppParamsSchema,
  WaitParamsSchema,
  RunParamsSchema,
} from './tools.js';
import { runOnDevice } from './run/execute.js';
import { verifyWDA } from '@athena-os/iphone-agent';
import { discoverDevices } from '@athena-os/iphone-agent';
import { resolveAppNameToBundleId } from '@athena-os/iphone-agent';
import { renderSemanticTree, selectFromModel } from '@athena-os/understanding';
import type { SemanticModel } from '@athena-os/core';

const logger = createLogger('MCPServer');

const server = new Server(
  {
    name: 'athena-os-mcp',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'doctor',
      description: 'Check environment readiness: Xcode, signing identity, WebDriverAgent, devices',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'devices',
      description: 'List connected iOS devices',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'connect',
      description: 'Connect to an iOS device and create a session',
      inputSchema: {
        type: 'object',
        properties: {
          udid: {
            type: 'string',
            description: 'Device UDID (optional, auto-detect if not provided)',
          },
          bundleId: { type: 'string', description: 'Initial bundle ID to launch (optional)' },
        },
      },
    },
    {
      name: 'launchApp',
      description: 'Launch an app on the connected device (by name or bundle ID)',
      inputSchema: {
        type: 'object',
        properties: {
          app: { type: 'string', description: 'App name (e.g. Settings) or bundle ID' },
          bundleId: { type: 'string', description: 'Bundle identifier of the app to launch' },
        },
      },
    },
    {
      name: 'tap',
      description: 'Tap an element on the screen',
      inputSchema: {
        type: 'object',
        properties: {
          selector: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['accessibilityId', 'label', 'predicate', 'xpath', 'coordinates'],
              },
              value: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['type'],
          },
        },
      },
    },
    {
      name: 'type',
      description: 'Type text into an element',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          selector: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['accessibilityId', 'label', 'predicate', 'xpath', 'coordinates'],
              },
              value: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['type'],
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'swipe',
      description: 'Swipe on the screen or an element',
      inputSchema: {
        type: 'object',
        properties: {
          selector: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['accessibilityId', 'label', 'predicate', 'xpath', 'coordinates'],
              },
              value: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['type'],
          },
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
          distance: { type: 'number', description: 'Swipe distance (0-1)' },
        },
      },
    },
    {
      name: 'screenshot',
      description: 'Take a screenshot of the current screen',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'getTree',
      description:
        'Inspect the current screen as a semantic UI model (roles, labels, confidence). "rendered" is a human-readable tree; the JSON model lives under metadata.model.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'find',
      description:
        'Resolve a UI element by human-readable label and return a driver selector plus confidence (Milestone 2D semantic resolution).',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Element label to find (e.g. "Airplane Mode")' },
          role: {
            type: 'string',
            description: 'Optional role filter (button, switch, text_field, ...)',
          },
          enabledOnly: { type: 'boolean', description: 'Only match enabled elements' },
          minConfidence: {
            type: 'number',
            description: 'Minimum resolution confidence in [0,1]',
          },
        },
        required: ['label'],
      },
    },
    {
      name: 'pressHome',
      description: 'Press the home button',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'terminateApp',
      description: 'Terminate an app',
      inputSchema: {
        type: 'object',
        properties: {
          bundleId: { type: 'string', description: 'Bundle identifier of the app to terminate' },
        },
        required: ['bundleId'],
      },
    },
    {
      name: 'wait',
      description: 'Wait for a specified duration',
      inputSchema: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: 'Duration in milliseconds' },
        },
        required: ['duration'],
      },
    },
    {
      name: 'back',
      description: 'Go back (navigate back)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'run',
      description:
        'Execute an intent end-to-end: reason (RFC-0011/0012) into a validated plan, then run the plan steps on the connected device. "dryRun" reasons, validates and previews without touching the device.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Natural-language intent, e.g. "Open Settings"',
          },
          dryRun: {
            type: 'boolean',
            description: 'Only reason and preview the plan; do not touch the device',
          },
          backend: {
            type: 'string',
            enum: ['auto', 'deterministic', 'llm', 'apple'],
            description:
              'Reasoning backend: auto (LLM when ATHENA_OPENAI_API_KEY is set, else deterministic), deterministic, llm, apple (Apple Foundation Models on-device)',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'disconnect',
      description: 'Disconnect from the device and close the session',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'doctor': {
        const t0 = Date.now();
        const status = await verifyWDA();
        const t1 = Date.now();
        const devices = await discoverDevices();
        const t2 = Date.now();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  ...status,
                  devices,
                  timings: { xcodeWdaMs: t1 - t0, devicesMs: t2 - t1, totalMs: t2 - t0 },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'devices': {
        const t0 = Date.now();
        const devices = await discoverDevices();
        const ms = Date.now() - t0;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, devices, timings: { devicesMs: ms } }, null, 2),
            },
          ],
        };
      }

      case 'connect': {
        const params = ConnectParamsSchema.parse(args);
        const result = await mcpSessionManager.connect({
          deviceUdid: params.udid ?? '',
          bundleId: params.bundleId,
          timeout: 30000,
          retries: 3,
          screenshotOnFailure: true,
          screenshotDir: 'screenshots',
          verifyAppState: true,
          verifyAppLaunch: true,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }, null, 2) }],
        };
      }

      case 'launchApp': {
        const params = LaunchAppParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const target = params.bundleId ?? params.app;
        if (!target) {
          throw new Error('launchApp requires an app name or bundleId');
        }
        const bundleId = await resolveAppNameToBundleId(target, executor.getSession().deviceUdid);
        const result = await executor.execute({
          type: 'launchApp',
          bundleId,
          description: `Launch ${target}`,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...result, bundleId, resolvedFrom: target }, null, 2),
            },
          ],
        };
      }

      case 'tap': {
        const params = TapParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'tap',
          selector: params.selector,
          description: 'Tap element',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'type': {
        const params = TypeParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'type',
          text: params.text,
          selector: params.selector,
          description: `Type: ${params.text}`,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'swipe': {
        const params = SwipeParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'swipe',
          selector: params.selector,
          direction: params.direction,
          distance: params.distance,
          description: `Swipe ${params.direction}`,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'screenshot': {
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'screenshot',
          description: 'Take screenshot',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'getTree': {
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'getTree',
          description: 'Get semantic UI model',
        });

        const resultObj = result as {
          metadata?: { model?: SemanticModel };
        };
        const model = resultObj.metadata?.model;
        const rendered = model?.root ? renderSemanticTree(model) : undefined;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...result, rendered }, null, 2),
            },
          ],
        };
      }

      case 'find': {
        const label = (args as { label?: string })?.label ?? '';
        const role = (args as { role?: string })?.role;
        const enabledOnly = (args as { enabledOnly?: boolean })?.enabledOnly ?? false;
        const minConfidence = (args as { minConfidence?: unknown })?.minConfidence as
          number | undefined;

        if (!label.trim()) {
          throw new Error('find requires a label');
        }

        const executor = mcpSessionManager.getExecutor();
        const treeResult = await executor.execute({
          type: 'getTree',
          description: 'Gather semantic model for find',
        });

        const model = (treeResult as { metadata?: { model?: SemanticModel } }).metadata?.model;

        if (!model?.root) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: false, error: 'No UI model available' }, null, 2),
              },
            ],
          };
        }

        const selected = selectFromModel(model, label, {
          role: role as never,
          enabledOnly,
          minConfidence,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                selected
                  ? {
                      success: true,
                      label,
                      selector: selected.selector,
                      confidence: selected.confidence,
                      quality: selected.quality,
                      role: selected.element.role,
                      enabled: selected.element.enabled,
                      visible: selected.element.visible,
                    }
                  : {
                      success: false,
                      label,
                      error: 'No element matched the requested label',
                    },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'pressHome': {
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'pressHome',
          description: 'Press home button',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'terminateApp': {
        const params = TerminateAppParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'terminateApp',
          bundleId: params.bundleId,
          description: `Terminate ${params.bundleId}`,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'wait': {
        const params = WaitParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'wait',
          duration: params.duration,
          description: `Wait ${params.duration}ms`,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'back': {
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({ type: 'back', description: 'Go back' });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'run': {
        const params = RunParamsSchema.parse(args);
        const outcome = await runOnDevice({
          prompt: params.prompt,
          dryRun: params.dryRun,
          backend: params.backend,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(outcome, null, 2) }],
        };
      }

      case 'disconnect': {
        await mcpSessionManager.disconnect();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Disconnected' }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error({ error, tool: name }, 'Tool execution failed');
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ success: false, error: message }, null, 2) },
      ],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'athena://sessions',
      name: 'Active Sessions',
      description: 'List of active device sessions',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'athena://sessions') {
    const sessions = mcpSessionManager.getActiveSessions();
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(sessions, null, 2) }],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

export async function startMCPServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server started on stdio');
}

export { server };
