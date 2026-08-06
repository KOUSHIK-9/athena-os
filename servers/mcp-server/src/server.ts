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
} from './tools.js';
import { verifyWDA } from '@athena-os/iphone-agent';
import { discoverDevices } from '@athena-os/iphone-agent';

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
      description: 'Launch an app on the connected device',
      inputSchema: {
        type: 'object',
        properties: {
          bundleId: { type: 'string', description: 'Bundle identifier of the app to launch' },
        },
        required: ['bundleId'],
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
      description: 'Get the accessibility tree of the current screen',
      inputSchema: { type: 'object', properties: {} },
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
        const status = await verifyWDA();
        const devices = await discoverDevices();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, ...status, devices }, null, 2),
            },
          ],
        };
      }

      case 'devices': {
        const devices = await discoverDevices();
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, devices }, null, 2) }],
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
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }, null, 2) }],
        };
      }

      case 'launchApp': {
        const params = LaunchAppParamsSchema.parse(args);
        const executor = mcpSessionManager.getExecutor();
        const result = await executor.execute({
          type: 'launchApp',
          bundleId: params.bundleId,
          description: `Launch ${params.bundleId}`,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
          description: 'Get accessibility tree',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
