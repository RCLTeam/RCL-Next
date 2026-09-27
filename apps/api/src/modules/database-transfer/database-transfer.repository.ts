import type { DatabaseImportPreview, DatabaseImportResult } from '@rcl/contracts';

export interface DatabaseTransferRepository {
  exportDatabase(actorId: string): Promise<Buffer>;
  previewImport(backup: Buffer, actorId: string): Promise<DatabaseImportPreview>;
  importDatabase(
    backup: Buffer,
    confirmation: string,
    actorId: string
  ): Promise<DatabaseImportResult>;
}
