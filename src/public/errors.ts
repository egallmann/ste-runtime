import type { RepositoryId, RuntimeDiagnostic } from './types.js';

export class RuntimeContractError extends Error {
  readonly code: string;
  readonly diagnostic: RuntimeDiagnostic;

  constructor(code: string, message: string, repositoryIds?: readonly RepositoryId[]) {
    super(`${code}: ${message}`);
    this.name = 'RuntimeContractError';
    this.code = code;
    this.diagnostic = { code, message, repositoryIds };
  }
}

export class RefreshError extends Error {
  readonly code: string;
  readonly diagnostics: readonly RuntimeDiagnostic[];

  constructor(code: string, message: string, diagnostics: readonly RuntimeDiagnostic[] = []) {
    super(message);
    this.name = 'RefreshError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}
