import crypto from 'node:crypto';

export type LogWriter = (line: string) => void;

export class IncidentLogger {
  private readonly writer: LogWriter;

  constructor(writer?: LogWriter) {
    this.writer = writer ?? ((line: string) => console.error(line));
  }

  /**
   * Logs a structured incident message to stderr and returns the incidentId.
   * Format: [INCIDENT <uuid>] Type: <tipo> | Message: <mensaje>
   */
  public log(type: string, message: string, incidentId?: string): string {
    const id = incidentId && incidentId.trim().length > 0 ? incidentId.trim() : crypto.randomUUID();

    const safeType = type || 'UNKNOWN_INCIDENT';
    const safeMessage = message ?? '';
    const formatted = `[INCIDENT ${id}] Type: ${safeType} | Message: ${safeMessage}`;

    this.writer(formatted);
    return id;
  }

  /**
   * Static helper for direct invocation without instantiating a logger.
   */
  public static log(type: string, message: string, incidentId?: string): string {
    return new IncidentLogger().log(type, message, incidentId);
  }
}
