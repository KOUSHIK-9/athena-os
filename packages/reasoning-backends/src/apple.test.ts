import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppleModelClient, AppleModelUnavailableError } from './apple/appleModelClient.js';
import { AppleBridgeError } from './apple/appleModelBridge.js';
import type { AppleModelConfig } from './apple/appleModelConfig.js';

function stubBridge(script: string): { config: AppleModelConfig; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'athena-apple-'));
  const bin = join(dir, 'stub-bridge');
  writeFileSync(bin, `#!/bin/bash\n${script}\n`, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return {
    config: { bridgePath: bin, buildOnDemand: false, timeoutMs: 10000, maxTokens: 64 },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function stubBridgeWithTimeout(
  script: string,
  timeoutMs: number
): { config: AppleModelConfig; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'athena-apple-'));
  const bin = join(dir, 'stub-bridge');
  writeFileSync(bin, `#!/bin/bash\n${script}\n`, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return {
    config: { bridgePath: bin, buildOnDemand: false, timeoutMs, maxTokens: 64 },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const INTENT = {
  id: 'i-1',
  text: 'Open Settings and search for Fitness',
  goals: [],
  constraints: [],
};

const GOALS_JSON =
  '{"goals":[{"kind":"openApp","description":"Open Settings"},{"kind":"type","description":"search for Fitness"}]}';

describe('AppleModelClient (on-device FoundationModels)', () => {
  it('extracts goals from the on-device model response', () => {
    const { config, cleanup } = stubBridge(
      `cat << 'EOF'\n{"ok":true,"text":"${GOALS_JSON.replace(/"/g, '\\"')}"}\nEOF`
    );
    try {
      const client = new AppleModelClient(config);
      expect(client.id).toBe('apple:system-language-model');
      const extraction = client.extractGoals(INTENT);
      expect(extraction.goals).toEqual([
        { kind: 'openApp', description: 'Open Settings' },
        { kind: 'type', description: 'search for Fitness' },
      ]);
    } finally {
      cleanup();
    }
  });

  it('propagates the Apple Intelligence availability reason as a typed error', () => {
    const { config, cleanup } = stubBridge(
      `echo '{"ok":false,"error":"appleIntelligenceNotEnabled","message":"system language model unavailable"}'`
    );
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleModelUnavailableError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleModelUnavailableError).reason).toBe('appleIntelligenceNotEnabled');
      }
    } finally {
      cleanup();
    }
  });

  it('surfaces missing-bridge as a bridge error when no build is available', () => {
    const client = new AppleModelClient({
      bridgePath: '/nonexistent/apple-model-bridge',
      buildOnDemand: false,
      timeoutMs: 10000,
      maxTokens: 64,
    });
    expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
  });

  it('propagates generation errors from the bridge', () => {
    const { config, cleanup } = stubBridge(
      `echo '{"ok":false,"error":"generation","message":"model refused"}'`
    );
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(/model refused/);
    } finally {
      cleanup();
    }
  });

  it('throws BRIDGE_TIMEOUT when the bridge hangs beyond the timeout', () => {
    const { config, cleanup } = stubBridgeWithTimeout('sleep 999', 200);
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleBridgeError).code).toBe('BRIDGE_TIMEOUT');
      }
    } finally {
      cleanup();
    }
  });

  it('throws BRIDGE_EXIT when the bridge exits non-zero', () => {
    const { config, cleanup } = stubBridge('echo "fatal error" >&2; exit 1');
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleBridgeError).code).toBe('BRIDGE_EXIT');
        expect((error as AppleBridgeError).message).toContain('exited 1');
      }
    } finally {
      cleanup();
    }
  });

  it('throws BRIDGE_OUTPUT when the bridge returns non-JSON text', () => {
    const { config, cleanup } = stubBridge('echo "this is not json"');
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleBridgeError).code).toBe('BRIDGE_OUTPUT');
        expect((error as AppleBridgeError).message).toContain('non-JSON');
      }
    } finally {
      cleanup();
    }
  });

  it('throws BRIDGE_OUTPUT when the bridge returns valid JSON with an unrecognized structure', () => {
    const { config, cleanup } = stubBridge('echo \'{"foo":"bar","baz":42}\'');
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleBridgeError).code).toBe('BRIDGE_OUTPUT');
        expect((error as AppleBridgeError).message).toContain('unrecognized');
      }
    } finally {
      cleanup();
    }
  });

  it('throws BRIDGE_OUTPUT when ok is true but text is missing', () => {
    const { config, cleanup } = stubBridge('echo \'{"ok":true}\'');
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleBridgeError).code).toBe('BRIDGE_OUTPUT');
      }
    } finally {
      cleanup();
    }
  });

  it('throws BRIDGE_OUTPUT when ok is false but error field is missing', () => {
    const { config, cleanup } = stubBridge('echo \'{"ok":false,"message":"oops"}\'');
    try {
      const client = new AppleModelClient(config);
      expect(() => client.extractGoals(INTENT)).toThrow(AppleBridgeError);
      try {
        client.extractGoals(INTENT);
      } catch (error) {
        expect((error as AppleBridgeError).code).toBe('BRIDGE_OUTPUT');
      }
    } finally {
      cleanup();
    }
  });

  it('retries with a repair instruction when the model returns invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'athena-apple-'));
    const bin = join(dir, 'stub-bridge');
    writeFileSync(
      bin,
      `#!/bin/bash
COUNT="$(dirname "$0")/.count"
n=$(cat "$COUNT" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$COUNT"
if [ "$n" -eq 1 ]; then
  echo '{"ok":true,"text":"this is not valid json {{{"}'
else
  echo '{"ok":true,"text":"${GOALS_JSON.replace(/"/g, '\\"')}"}'
fi
`,
      { mode: 0o755 }
    );
    chmodSync(bin, 0o755);
    const config: AppleModelConfig = {
      bridgePath: bin,
      buildOnDemand: false,
      timeoutMs: 10000,
      maxTokens: 64,
      maxParseRetries: 1,
    };
    try {
      const client = new AppleModelClient(config);
      const extraction = client.extractGoals(INTENT);
      expect(extraction.goals).toEqual([
        { kind: 'openApp', description: 'Open Settings' },
        { kind: 'type', description: 'search for Fitness' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('degrades to a clarification (no hard error) when retries are exhausted', () => {
    const { config, cleanup } = stubBridge('echo \'{"ok":true,"text":"still not valid json"}\'');
    try {
      const client = new AppleModelClient({ ...config, maxParseRetries: 1 });
      const extraction = client.extractGoals(INTENT);
      expect(extraction.goals).toEqual([]);
      expect(typeof extraction.clarification).toBe('string');
      expect(extraction.clarification).toMatch(/invalid JSON/i);
    } finally {
      cleanup();
    }
  });
});
