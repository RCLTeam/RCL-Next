import type { SuggestionStatus } from '@rcl/contracts';

export function isTerminalStatus(status: SuggestionStatus): boolean {
  return status === 'confirmed' || status === 'failed';
}

export interface SuggestionRecord {
  id: string;
  status: SuggestionStatus;
  suggestion?: string | undefined;
  authorId?: string | undefined;
  authorUsername?: string | undefined;
  createdAt: number;
  updatedAt: number;
  nextRetryInSeconds?: number | undefined;
  incidentId?: string | undefined;
  error?: string | undefined;
  channelId?: string | number | undefined;
  messageId?: string | number | undefined;
  threadId?: string | number | undefined;
}

export interface UpdateStatusOptions {
  nextRetryInSeconds?: number | undefined;
  incidentId?: string | undefined;
  error?: string | undefined;
  channelId?: string | number | undefined;
  messageId?: string | number | undefined;
  threadId?: string | number | undefined;
}

export interface SuggestionStoreOptions {
  ttlMs?: number | undefined; // Default: 2 hours (7,200,000 ms)
  cleanupIntervalMs?: number | undefined; // Default: 10 minutes (600,000 ms)
  enablePeriodicCleanup?: boolean | undefined; // Default: true
}

export const DEFAULT_SUGGESTION_TTL_MS = 2 * 60 * 60 * 1000; // 7,200,000 ms

export class SuggestionStore {
  private readonly records = new Map<string, SuggestionRecord>();
  private readonly ttlMs: number;
  private readonly cleanupIntervalMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: SuggestionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SUGGESTION_TTL_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 10 * 60 * 1000;

    if (options.enablePeriodicCleanup !== false) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.cleanupIntervalMs);

      if (typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  public create(id: string, initialStatus: SuggestionStatus = 'queued'): SuggestionRecord {
    const now = Date.now();
    const record: SuggestionRecord = {
      id,
      status: initialStatus,
      createdAt: now,
      updatedAt: now
    };
    this.records.set(id, record);
    return record;
  }

  public set(
    record: Omit<SuggestionRecord, 'createdAt' | 'updatedAt'> &
      Partial<Pick<SuggestionRecord, 'createdAt' | 'updatedAt'>>
  ): SuggestionRecord {
    const now = Date.now();
    const fullRecord: SuggestionRecord = {
      ...record,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now
    };
    this.records.set(record.id, fullRecord);
    return fullRecord;
  }

  public get(id: string, now: number = Date.now()): SuggestionRecord | undefined {
    const record = this.records.get(id);
    if (!record) {
      return undefined;
    }

    if (now - record.createdAt >= this.ttlMs) {
      this.records.delete(id);
      return undefined;
    }

    return record;
  }

  public update(
    id: string,
    updates: Partial<Omit<SuggestionRecord, 'id' | 'createdAt'>>
  ): SuggestionRecord | undefined {
    const record = this.get(id);
    if (!record) {
      return undefined;
    }

    const isCurrentTerminal = isTerminalStatus(record.status);
    let effectiveUpdates = updates;

    if (isCurrentTerminal && updates.status !== undefined && !isTerminalStatus(updates.status)) {
      const { status: omittedStatus, ...rest } = updates;
      void omittedStatus;
      effectiveUpdates = rest;
    }

    Object.assign(record, effectiveUpdates);
    record.updatedAt = Date.now();

    if (record.status !== 'retrying') {
      record.nextRetryInSeconds = undefined;
    }

    return record;
  }

  public updateStatus(
    id: string,
    status: SuggestionStatus,
    options?: UpdateStatusOptions
  ): SuggestionRecord | undefined {
    return this.update(id, {
      status,
      ...options
    });
  }

  public cleanup(now: number = Date.now()): number {
    let pruned = 0;
    for (const [id, record] of this.records.entries()) {
      if (now - record.createdAt >= this.ttlMs) {
        this.records.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  public prune(now?: number): number {
    return this.cleanup(now);
  }

  public delete(id: string): boolean {
    return this.records.delete(id);
  }

  public size(): number {
    return this.records.size;
  }

  public clear(): void {
    this.records.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  public close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
