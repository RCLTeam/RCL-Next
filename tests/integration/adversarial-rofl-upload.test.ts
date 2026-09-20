import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processBatchFiles } from '../../apps/api/src/modules/rofl-upload/processing/process-batch-files.js';

const require = createRequire(import.meta.url);
const admZip = require('adm-zip');

describe('Zip Bomb & Resource Exhaustion Defense', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `adversarial-quota-tests-${crypto.randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects archives containing more than 10 replay files', async () => {
    const zip = new admZip();
    for (let i = 0; i < 11; i++) {
      zip.addFile(`game_${i}.rofl`, Buffer.from('dummy_data'));
    }
    const zipPath = path.join(tempDir, 'too-many-files.zip');
    await fs.writeFile(zipPath, zip.toBuffer());

    await expect(
      processBatchFiles({
        sourceFilePath: zipPath,
        originalFileName: 'too-many-files.zip'
      })
    ).rejects.toThrow(/Maximum allowed is 10/);
  });

  it('rejects archive containing individual file larger than 50MB projected size', async () => {
    const zip = new admZip();
    // Simulate header with uncompressed size > 50MB
    const buf = Buffer.alloc(1024, 0);
    zip.addFile('huge.rofl', buf);
    const entry = zip.getEntries()[0];
    entry.header.size = 51 * 1024 * 1024;
    const zipPath = path.join(tempDir, 'huge-file.zip');
    await fs.writeFile(zipPath, zip.toBuffer());

    await expect(
      processBatchFiles({
        sourceFilePath: zipPath,
        originalFileName: 'huge-file.zip'
      })
    ).rejects.toThrow(/exceeds maximum size of 50MB/);
  });

  it('rejects archive with compression ratio exceeding 100:1 (Zip Bomb)', async () => {
    const zip = new admZip();
    const zeros = Buffer.alloc(2 * 1024 * 1024, 0); // Highly compressible
    zip.addFile('bomb.rofl', zeros);
    const zipPath = path.join(tempDir, 'bomb.zip');
    await fs.writeFile(zipPath, zip.toBuffer());

    await expect(
      processBatchFiles({
        sourceFilePath: zipPath,
        originalFileName: 'bomb.zip'
      })
    ).rejects.toThrow(/exceeds maximum compression ratio/);
  });

  it('rejects archive when total uncompressed size exceeds 300MB', async () => {
    const zip = new admZip();
    for (let i = 0; i < 7; i++) {
      const randomBuf = crypto.randomBytes(1024 * 1024);
      zip.addFile(`game_${i}.rofl`, randomBuf);
      const entry = zip.getEntries()[i];
      // 7 * 45MB = 315MB > 300MB; ratio = 45MB / 1MB = 45:1 <= 100:1
      entry.header.size = 45 * 1024 * 1024;
    }
    const zipPath = path.join(tempDir, 'total-exceeded.zip');
    await fs.writeFile(zipPath, zip.toBuffer());

    await expect(
      processBatchFiles({
        sourceFilePath: zipPath,
        originalFileName: 'total-exceeded.zip'
      })
    ).rejects.toThrow(/Total uncompressed size of archive exceeds 300MB/);
  });
});
