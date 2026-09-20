import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executePythonParser } from '../../apps/api/src/modules/rofl-upload/processing/execute-python-parser.js';

describe('Python Parser Subprocess Timeout Defense', () => {
  it('throws execution timeout error when subprocess exceeds timeout bound', async () => {
    const tempDir = path.join(os.tmpdir(), `timeout-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Dummy rofl file
    const fakeRofl = path.join(tempDir, 'game.rofl');
    await fs.writeFile(fakeRofl, 'ROFLdummycontent');

    // Create a mock script that sleeps indefinitely
    const slowScript = path.join(tempDir, 'slow_parser.py');
    await fs.writeFile(slowScript, 'import time\ntime.sleep(60)\n');

    await expect(
      executePythonParser({
        roflFilePaths: [fakeRofl],
        pythonScriptPath: slowScript,
        outputDir: tempDir,
        // Override timeout to 500ms for fast test execution
        timeoutMs: 500
      })
    ).rejects.toThrow(/timed out/i);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('completes successfully when subprocess finishes well within timeout', async () => {
    const tempDir = path.join(os.tmpdir(), `timeout-fast-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const fakeRofl = path.join(tempDir, 'fast_game.rofl');
    await fs.writeFile(fakeRofl, 'ROFLdummycontent');

    // Fast mock script that creates the output json file
    const fastScript = path.join(tempDir, 'fast_parser.py');
    await fs.writeFile(
      fastScript,
      'import sys, json, os\n' +
        'out_idx = sys.argv.index("-o") + 1\n' +
        'out_path = sys.argv[out_idx]\n' +
        'with open(out_path, "w") as f:\n' +
        '    json.dump({"gameId": 123}, f)\n'
    );

    const result = await executePythonParser({
      roflFilePaths: [fakeRofl],
      pythonScriptPath: fastScript,
      outputDir: tempDir,
      timeoutMs: 5000
    });

    expect(result.validRoflCount).toBe(1);
    expect(result.jsonFilePaths.length).toBe(1);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('throws maxBuffer error when python subprocess outputs excessive stdout (>10MB)', async () => {
    const tempDir = path.join(os.tmpdir(), `maxbuffer-stdout-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const fakeRofl = path.join(tempDir, 'flood_stdout_game.rofl');
    await fs.writeFile(fakeRofl, 'ROFLdummycontent');

    const floodScript = path.join(tempDir, 'flood_stdout.py');
    await fs.writeFile(floodScript, 'import sys\nsys.stdout.write("A" * (11 * 1024 * 1024))\n');

    await expect(
      executePythonParser({
        roflFilePaths: [fakeRofl],
        pythonScriptPath: floodScript,
        outputDir: tempDir,
        timeoutMs: 5000
      })
    ).rejects.toThrow(/stdout maxBuffer length exceeded/i);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('throws maxBuffer error when python subprocess outputs excessive stderr (>10MB)', async () => {
    const tempDir = path.join(os.tmpdir(), `maxbuffer-stderr-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const fakeRofl = path.join(tempDir, 'flood_stderr_game.rofl');
    await fs.writeFile(fakeRofl, 'ROFLdummycontent');

    const floodScript = path.join(tempDir, 'flood_stderr.py');
    await fs.writeFile(floodScript, 'import sys\nsys.stderr.write("B" * (11 * 1024 * 1024))\n');

    await expect(
      executePythonParser({
        roflFilePaths: [fakeRofl],
        pythonScriptPath: floodScript,
        outputDir: tempDir,
        timeoutMs: 5000
      })
    ).rejects.toThrow(/stderr maxBuffer length exceeded/i);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
