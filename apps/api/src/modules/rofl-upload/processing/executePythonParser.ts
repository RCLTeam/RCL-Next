import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EXIT_CODE_INVALID_MAGIC_HEADER = 11;

export const MAX_PARSER_CONCURRENCY = Math.max(
  1,
  (os.availableParallelism?.() ?? os.cpus().length) - 1
);

export interface ExecutePythonParserOptions {
  roflFilePaths: string[];
  outputDir?: string | undefined;
  onProgress?: ((parsedCount: number, totalCount: number, currentFile: string) => void) | undefined;
  onWarning?: ((message: string, currentFile: string) => void) | undefined;
  pythonScriptPath?: string | undefined;
  pythonExecutable?: string | undefined;
  concurrency?: number | undefined;
}

export interface ExecutePythonParserResult {
  jsonFilePaths: string[];
  skippedFiles: string[];
  validRoflCount: number;
}

export function validateParserFileCounts(roflCount: number, jsonCount: number): void {
  if (roflCount !== jsonCount) {
    throw new Error(
      `Parser output count mismatch: expected ${roflCount} JSON files, but got ${jsonCount}`
    );
  }
}

function resolveDefaultParserScript(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(currentDir, '../../../../../../apps/parser/roflParser.py');
  return candidate;
}

function extractExitCode(err: unknown): number | null {
  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.code === 'number') {
      return record.code;
    }
    if (typeof record.status === 'number') {
      return record.status;
    }
    if (typeof record.exitCode === 'number') {
      return record.exitCode;
    }
    if (typeof record.code === 'string' && /^\d+$/.test(record.code)) {
      return Number.parseInt(record.code, 10);
    }
  }
  return null;
}

export async function executePythonParser(
  options: ExecutePythonParserOptions
): Promise<ExecutePythonParserResult> {
  const { roflFilePaths } = options;

  if (roflFilePaths.length === 0) {
    return { jsonFilePaths: [], skippedFiles: [], validRoflCount: 0 };
  }

  const scriptPath = options.pythonScriptPath ?? resolveDefaultParserScript();
  const pythonExecutable = options.pythonExecutable ?? 'python3';
  const effectiveConcurrency = Math.min(
    options.concurrency ?? MAX_PARSER_CONCURRENCY,
    MAX_PARSER_CONCURRENCY
  );

  const jsonFilePaths: string[] = new Array(roflFilePaths.length);
  const skippedFiles: string[] = [];
  let currentIndex = 0;
  let completedCount = 0;

  async function worker(): Promise<void> {
    while (currentIndex < roflFilePaths.length) {
      const index = currentIndex++;
      const roflPath = roflFilePaths[index];
      if (!roflPath) continue;

      const outDir = options.outputDir ?? path.dirname(roflPath);
      const baseName = path.basename(roflPath, path.extname(roflPath));
      const outputPath = path.join(outDir, `${baseName}_estadisticas.json`);

      let isNonRoflSkipped = false;
      try {
        await execFileAsync(pythonExecutable, [scriptPath, roflPath, '-o', outputPath, '-q']);
      } catch (err: unknown) {
        const exitCode = extractExitCode(err);
        if (exitCode === EXIT_CODE_INVALID_MAGIC_HEADER) {
          isNonRoflSkipped = true;
          const fileName = path.basename(roflPath);
          const warningMessage = `El archivo '${fileName}' no tiene la cabecera ROFL válida y ha sido omitido`;
          skippedFiles.push(roflPath);
          options.onWarning?.(warningMessage, roflPath);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to parse ROFL file '${path.basename(roflPath)}': ${message}`);
        }
      }

      if (isNonRoflSkipped) {
        completedCount++;
        options.onProgress?.(completedCount, roflFilePaths.length, roflPath);
        continue;
      }

      const stat = await fs.stat(outputPath).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new Error(
          `Generated JSON file not found for '${path.basename(roflPath)}' at expected path: ${outputPath}`
        );
      }

      jsonFilePaths[index] = outputPath;
      completedCount++;
      options.onProgress?.(completedCount, roflFilePaths.length, roflPath);
    }
  }

  const workerCount = Math.max(1, Math.min(effectiveConcurrency, roflFilePaths.length));
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);

  const validJsonFiles = jsonFilePaths.filter((p): p is string => Boolean(p));
  const validRoflCount = roflFilePaths.length - skippedFiles.length;

  if (validRoflCount === 0) {
    throw new Error(
      'No valid ROFL files found in batch to process (all files had invalid ROFL headers)'
    );
  }

  validateParserFileCounts(validRoflCount, validJsonFiles.length);

  return {
    jsonFilePaths: validJsonFiles,
    skippedFiles,
    validRoflCount
  };
}
