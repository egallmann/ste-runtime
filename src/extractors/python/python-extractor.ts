import path from 'node:path';
import { execa } from 'execa';
import { globby, globbySync } from 'globby';
import { BaseExtractor, type ExtractedStructure } from '../base-extractor.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const SCRIPT_PATH = path.resolve(process.cwd(), 'python-scripts', 'ast_parser.py');
const PY_CANDIDATES = [
  process.env.PYTHON_BIN,
  process.platform === 'win32' ? 'python' : 'python3',
  'python3',
  'python',
].filter(Boolean) as string[];

const toPosix = (filePath: string) => filePath.replace(/\\/g, '/');

async function runParser(binary: string, targetFile: string) {
  return execa(binary, [SCRIPT_PATH, targetFile], { timeout: DEFAULT_TIMEOUT_MS });
}

export class PythonExtractor extends BaseExtractor {
  canHandle(filePath: string): boolean {
    const candidatePath = path.resolve(filePath);
    if (path.extname(candidatePath) === '.py') return true;

    try {
      const matches = globbySync(['**/*.py'], {
        cwd: candidatePath,
        gitignore: true,
        deep: 3,
      });
      return matches.length > 0;
    } catch {
      return false;
    }
  }

  async extractFile(filePath: string): Promise<ExtractedStructure[]> {
    const resolvedPath = path.resolve(filePath);
    let lastError: unknown;

    for (const binary of PY_CANDIDATES) {
      try {
        const { stdout } = await runParser(binary, resolvedPath);
        const parsed = JSON.parse(stdout) as ExtractedStructure;
        parsed.language = 'python';
        parsed.filepath = toPosix(resolvedPath);
        return [parsed];
      } catch (error: any) {
        lastError = error;
        if (error?.code === 'ENOENT') {
          continue; // Try next python binary
        }

        const stderr = error?.stderr ?? error?.shortMessage ?? String(error);
        console.warn(`Python extractor failed for ${resolvedPath}: ${stderr}`);
        return [];
      }
    }

    console.warn(
      `Python extractor could not find a working Python binary for ${resolvedPath}: ${String(
        lastError,
      )}`,
    );
    return [];
  }

  async extractProject(projectRoot: string): Promise<ExtractedStructure[]> {
    const cwd = path.resolve(projectRoot);
    const patterns = [
      '**/*.py',
      '!**/venv/**',
      '!**/.venv/**',
      '!**/node_modules/**',
      '!**/.git/**',
      '!**/.ste/**',
    ];

    const files = await globby(patterns, {
      cwd,
      absolute: true,
      gitignore: true,
    });

    const results = await Promise.all(files.map((file) => this.extractFile(file)));
    return results.flat();
  }
}

