import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import type { DatabaseTransferRepository } from './database-transfer.repository.js';

export const MAX_DATABASE_BACKUP_BYTES = 64 * 1024 * 1024;
export class DatabaseTransferService {
  private running = false;
  constructor(private readonly repository: DatabaseTransferRepository) {}
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running)
      throw new AppError(409, 'DATABASE_BUSY', 'Another database transfer is running.');
    this.running = true;
    try {
      return await operation();
    } finally {
      this.running = false;
    }
  }
  exportDatabase(actorId: string) {
    return this.exclusive(() => this.repository.exportDatabase(actorId));
  }
  private backup(body: unknown): Buffer {
    if (!Buffer.isBuffer(body) || !body.length)
      throw new AppError(422, 'INVALID_BACKUP', 'A backup file is required.');
    if (body.length > MAX_DATABASE_BACKUP_BYTES)
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Backup exceeds the 64 MiB limit.');
    return body;
  }
  previewImport(body: unknown, actorId: string) {
    const backup = this.backup(body);
    return this.exclusive(() => this.repository.previewImport(backup, actorId));
  }
  importDatabase(body: unknown, confirmation: unknown, actorId: string) {
    const backup = this.backup(body);
    const token = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(confirmation);
    return this.exclusive(() => this.repository.importDatabase(backup, token, actorId));
  }
}
