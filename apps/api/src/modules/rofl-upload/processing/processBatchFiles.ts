import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

export interface ProcessBatchFilesOptions {
  sourceFilePath: string;
  originalFileName: string;
  onQueueStatus?: ((pos: number, total: number) => void) | undefined;
  signal?: AbortSignal | undefined;
}

export interface ProcessBatchFilesResult {
  tempDir: string;
  roflFilePaths: string[];
}

export class DecompressionQueue {
  private isRunning = false;
  private queue: Array<{
    id: string;
    onQueueStatus?: ((pos: number, total: number) => void) | undefined;
    signal?: AbortSignal | undefined;
    resolve: () => void;
    reject: (err: unknown) => void;
  }> = [];

  private notifyWaiters(): void {
    const activeCount = this.isRunning ? 1 : 0;
    const total = activeCount + this.queue.length;
    for (let index = 0; index < this.queue.length; index++) {
      const item = this.queue[index];
      if (!item) continue;
      const pos = activeCount + index + 1;
      item.onQueueStatus?.(pos, total);
    }
  }

  async acquire(
    onQueueStatus?: (pos: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<() => void> {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Operation aborted');
    }

    if (!this.isRunning) {
      this.isRunning = true;
      onQueueStatus?.(1, 1);
      return () => this.release();
    }

    return new Promise<() => void>((resolve, reject) => {
      const id = crypto.randomUUID();
      const entry = {
        id,
        onQueueStatus,
        signal,
        resolve: () => {
          resolve(() => this.release());
        },
        reject
      };

      if (signal) {
        const onAbort = () => {
          signal.removeEventListener('abort', onAbort);
          const idx = this.queue.findIndex((q) => q.id === id);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            this.notifyWaiters();
          }
          reject(signal.reason ?? new Error('Operation aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue.push(entry);
      this.notifyWaiters();
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      this.isRunning = true;
      this.notifyWaiters();
      next.onQueueStatus?.(1, 1 + this.queue.length);
      next.resolve();
    } else {
      this.isRunning = false;
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isBusy(): boolean {
    return this.isRunning;
  }

  reset(): void {
    this.queue = [];
    this.isRunning = false;
  }
}

export const decompressionQueue = new DecompressionQueue();

export async function cleanupTempDir(dir: string): Promise<void> {
  if (dir) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function createZipArchive(
  entries: Array<{ name: string; content: Buffer | string }>
): Buffer {
  const zip = new AdmZip();
  const replacements: Array<{ placeholder: string; actual: string }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const data = typeof entry.content === 'string' ? Buffer.from(entry.content) : entry.content;

    if (entry.name.includes('../') || entry.name.includes('..\\')) {
      const placeholder = `placeholder_${String(i).padStart(3, '0')}_`
        .padEnd(entry.name.length, 'z')
        .slice(0, entry.name.length);
      replacements.push({ placeholder, actual: entry.name });
      zip.addFile(placeholder, data);
    } else {
      zip.addFile(entry.name, data);
    }
  }

  const buf = zip.toBuffer();
  for (const { placeholder, actual } of replacements) {
    let idx = buf.indexOf(placeholder);
    while (idx !== -1) {
      buf.write(actual, idx, 'utf8');
      idx = buf.indexOf(placeholder, idx + 1);
    }
  }

  return buf;
}

export function validateZipSlip(baseDir: string, entryPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, entryPath);
  const relative = path.relative(resolvedBase, resolvedTarget);

  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error(`Zip slip security violation: path traversal detected in entry '${entryPath}'`);
  }

  return resolvedTarget;
}

export async function processBatchFiles(
  optionsOrPath: ProcessBatchFilesOptions | string,
  originalFileName?: string,
  onQueueStatus?: (pos: number, total: number) => void
): Promise<ProcessBatchFilesResult> {
  const options: ProcessBatchFilesOptions =
    typeof optionsOrPath === 'string'
      ? {
          sourceFilePath: optionsOrPath,
          originalFileName: originalFileName ?? path.basename(optionsOrPath),
          onQueueStatus
        }
      : optionsOrPath;

  const tempDir = path.join(os.tmpdir(), `rcl-rofl-${crypto.randomUUID()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const fileNameLower = options.originalFileName.toLowerCase();
  const isZip = fileNameLower.endsWith('.zip');
  const isRofl = fileNameLower.endsWith('.rofl');

  if (!isZip && !isRofl) {
    await cleanupTempDir(tempDir);
    throw new Error(
      `Unsupported file type: expected .rofl or .zip, received '${options.originalFileName}'`
    );
  }

  const roflFilePaths: string[] = [];

  if (isRofl) {
    // Single .rofl files bypass queue completely
    try {
      const targetFileName = path.basename(options.originalFileName);
      const targetPath = path.join(tempDir, targetFileName);
      await fs.copyFile(options.sourceFilePath, targetPath);
      roflFilePaths.push(targetPath);
      return { tempDir, roflFilePaths };
    } catch (err) {
      await cleanupTempDir(tempDir);
      throw err;
    }
  }

  // Decompression FIFO queue: only 1 ZIP decompression permitted at a time
  const releaseQueue = await decompressionQueue.acquire(options.onQueueStatus, options.signal);
  try {
    const zip = new AdmZip(options.sourceFilePath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const targetPath = validateZipSlip(tempDir, entry.entryName);

      if (entry.entryName.toLowerCase().endsWith('.rofl')) {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, entry.getData());
        roflFilePaths.push(targetPath);
      }
    }

    if (roflFilePaths.length === 0) {
      throw new Error('No .rofl files found in zip archive');
    }

    return { tempDir, roflFilePaths };
  } catch (err) {
    await cleanupTempDir(tempDir);
    throw err;
  } finally {
    releaseQueue();
  }
}
