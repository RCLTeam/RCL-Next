import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncidentLogger } from './incident-logger.js';

describe('IncidentLogger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('generates and returns UUIDv4 incidentId when not provided', () => {
    const id = IncidentLogger.log('NETWORK_ERROR', 'Connection failed');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('formats stderr output strictly matching the authoritative incident regex', () => {
    const id = IncidentLogger.log('AUTH_FAILURE', 'Supertoken rejected');
    const expectedRegex = /^\[INCIDENT [0-9a-fA-F-]{36}\] Type: .+ \| Message: .+$/;
    const output = stderrSpy.mock.calls[0]?.[0] as string;

    expect(output).toMatch(expectedRegex);
    expect(output).toBe(`[INCIDENT ${id}] Type: AUTH_FAILURE | Message: Supertoken rejected`);
  });

  it('preserves an existing incidentId when passed explicitly', () => {
    const existingId = '12345678-1234-4000-8000-1234567890ab';
    const returnedId = IncidentLogger.log('RATE_LIMIT_TIMEOUT', 'Max retries exceeded', existingId);

    expect(returnedId).toBe(existingId);
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain(`[INCIDENT ${existingId}]`);
  });

  it('safely handles empty or special character messages', () => {
    const id = IncidentLogger.log('WEIRD_TYPE', 'Message with | pipe and [bracket]');
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toBe(
      `[INCIDENT ${id}] Type: WEIRD_TYPE | Message: Message with | pipe and [bracket]`
    );
  });

  it('safely handles multiline and empty string messages without crashing', () => {
    const emptyId = IncidentLogger.log('EMPTY', '');
    const emptyOutput = stderrSpy.mock.calls[0]?.[0] as string;
    expect(emptyOutput).toBe(`[INCIDENT ${emptyId}] Type: EMPTY | Message: `);

    const multilineId = IncidentLogger.log('MULTILINE', 'Line 1\nLine 2');
    const multilineOutput = stderrSpy.mock.calls[1]?.[0] as string;
    expect(multilineOutput).toBe(
      `[INCIDENT ${multilineId}] Type: MULTILINE | Message: Line 1\nLine 2`
    );
  });

  it('supports custom output sink in instance mode', () => {
    const customWriter = vi.fn();
    const logger = new IncidentLogger(customWriter);

    const id = logger.log('CUSTOM_SINK', 'Testing custom writer');
    expect(customWriter).toHaveBeenCalledTimes(1);
    expect(customWriter).toHaveBeenCalledWith(
      `[INCIDENT ${id}] Type: CUSTOM_SINK | Message: Testing custom writer`
    );
  });
});
