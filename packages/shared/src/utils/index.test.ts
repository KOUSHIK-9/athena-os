import { describe, it, expect, vi } from 'vitest';
import {
  sleep,
  generateId,
  generateUUID,
  sanitizePath,
  truncate,
  retry,
  debounce,
  throttle,
  deepClone,
  isPlainObject,
  omit,
  pick,
} from './index.js';

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('id generation', () => {
  it('generates a unique id', () => {
    expect(generateId()).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it('generates a valid uuid v4', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(generateUUID()).toMatch(uuidPattern);
  });
});

describe('sanitizePath', () => {
  it('replaces invalid path characters', () => {
    expect(sanitizePath('a<b>c:d"e|f?g*h')).toBe('a_b_c_d_e_f_g_h');
  });

  it('leaves valid paths unchanged', () => {
    expect(sanitizePath('/tmp/athena/screenshots')).toBe('/tmp/athena/screenshots');
  });
});

describe('truncate', () => {
  it('returns string unchanged when short', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('abcdefghij', 6)).toBe('abc...');
  });
});

describe('retry', () => {
  it('returns the resolved value on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retry(fn, { retries: 2, delay: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    await expect(retry(fn, { retries: 3, delay: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retry(fn, { retries: 2, delay: 0 })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(retry(fn, { retries: 3, delay: 0, shouldRetry: () => false })).rejects.toThrow(
      'fatal'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('debounce', () => {
  it('only calls fn after the wait window', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    vi.useRealTimers();
  });
});

describe('throttle', () => {
  it('fires immediately then at most once per window', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('object helpers', () => {
  it('deepClone deep-copies objects', () => {
    const obj = { a: 1, b: { c: [1, 2] } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
  });

  it('isPlainObject detects plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });

  it('omit removes keys', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
  });

  it('pick selects keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });
});
