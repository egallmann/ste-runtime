/**
 * Cross-platform path utilities for STE Runtime
 * 
 * Ensures consistent path handling across Windows, Linux, and macOS.
 * 
 * Key principles:
 * - Internal IDs use POSIX-style paths (forward slashes) for consistency
 * - Filesystem operations use Node.js path module (handles OS differences)
 * - Filenames are sanitized to be valid on all platforms
 */

import path from 'node:path';

/**
 * Normalize a path to POSIX-style (forward slashes).
 * Used for generating consistent IDs across platforms.
 * 
 * @example
 * toPosixPath('backend\\lambda\\api\\accounts.py') 
 * // => 'backend/lambda/api/accounts.py'
 */
export function toPosixPath(filePath: string): string {
  // Replace Windows backslashes with forward slashes
  return filePath.replace(/\\/g, '/');
}

/**
 * Generate a slice ID from a file path and element name.
 * IDs are POSIX-normalized for cross-platform consistency.
 * 
 * @example
 * generateSliceId('function', 'backend/lambda/api/accounts.py', 'lambda_handler')
 * // => 'function:backend/lambda/api/accounts.py:lambda_handler'
 */
export function generateSliceId(
  type: string,
  filePath: string,
  elementName: string
): string {
  const normalizedPath = toPosixPath(filePath);
  return `${type}:${normalizedPath}:${elementName}`;
}

/**
 * Generate a module ID from a file path.
 * 
 * @example
 * generateModuleId('backend/lambda/api/accounts.py')
 * // => 'module-backend-lambda-api-accounts'
 */
export function generateModuleId(filePath: string): string {
  const normalized = toPosixPath(filePath);
  // Remove extension (.ts, .tsx, .js, .jsx, .py)
  const withoutExt = normalized.replace(/\.(ts|tsx|js|jsx|py)$/, '');
  // Replace path separators with dashes
  return `module-${withoutExt.replace(/\//g, '-')}`;
}

/**
 * Sanitize an ID for use as a filename.
 * Removes/replaces characters that are invalid on ANY platform.
 * 
 * Invalid on Windows: \ / : * ? " < > |
 * Invalid on Unix: / (and null byte, but that's not in strings)
 * 
 * @example
 * sanitizeForFilename('function:backend/lambda/api/accounts.py:lambda_handler')
 * // => 'function-backend-lambda-api-accounts.py-lambda_handler'
 */
export function sanitizeForFilename(id: string): string {
  return id
    .replace(/:/g, '-')      // Colons → dashes (Windows invalid)
    .replace(/\//g, '-')     // Forward slashes → dashes (path separator)
    .replace(/\\/g, '-')     // Backslashes → dashes (Windows path separator)
    .replace(/\*/g, '_')     // Asterisks → underscores (Windows invalid)
    .replace(/\?/g, '_')     // Question marks → underscores (Windows invalid)
    .replace(/"/g, '_')      // Quotes → underscores (Windows invalid)
    .replace(/</g, '_')      // Less than → underscores (Windows invalid)
    .replace(/>/g, '_')      // Greater than → underscores (Windows invalid)
    .replace(/\|/g, '_');    // Pipes → underscores (Windows invalid)
}

/**
 * Get the relative path from project root, normalized to POSIX.
 * Handles both Windows and Unix absolute paths.
 */
export function getRelativePosixPath(absolutePath: string, projectRoot: string): string {
  const relativePath = path.relative(projectRoot, absolutePath);
  return toPosixPath(relativePath);
}

/**
 * Join path segments using OS-appropriate separator.
 * Wrapper around path.join for explicit documentation.
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Resolve to absolute path using OS-appropriate handling.
 * Wrapper around path.resolve for explicit documentation.
 */
export function resolvePath(...segments: string[]): string {
  return path.resolve(...segments);
}




