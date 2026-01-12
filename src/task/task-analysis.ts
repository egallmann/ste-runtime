import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

type OutputFormat = 'table' | 'json' | 'both';

export type TaskAnalyzeOptions = {
  stateRoot?: string;
  format?: OutputFormat;
  top?: number;
  threshold?: number;
};

const PYTHON_CMD = process.env.PYTHON || 'python';

function resolveScriptPath() {
  const scriptUrl = new URL('../../python-scripts/task_analysis.py', import.meta.url);
  return path.resolve(fileURLToPath(scriptUrl));
}

export async function runTaskAnalyze(task: string, options: TaskAnalyzeOptions = {}): Promise<void> {
  const scriptPath = resolveScriptPath();
  const args = [scriptPath, '--task', task];
  if (options.stateRoot) args.push('--state', options.stateRoot);
  if (options.format) args.push('--format', options.format);
  if (typeof options.top === 'number') args.push('--top', String(options.top));
  if (typeof options.threshold === 'number') args.push('--threshold', String(options.threshold));

  await execa(PYTHON_CMD, args, { stdio: 'inherit' });
}

