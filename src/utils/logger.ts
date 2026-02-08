/**
 * Logger utility for ste-runtime.
 * 
 * In MCP mode, all output must go to stderr because stdout is reserved
 * for JSON-RPC protocol messages. This logger provides a unified interface
 * that automatically routes output based on the runtime mode.
 * 
 * Usage:
 *   import { log, warn, error, setMcpMode } from '../utils/logger.js';
 *   
 *   // In CLI entry point for MCP mode:
 *   setMcpMode(true);
 *   
 *   // Throughout the codebase:
 *   log('[RECON] Starting...');  // Goes to stderr in MCP mode
 */

let mcpMode = false;

/**
 * Enable or disable MCP mode.
 * When true, all log output goes to stderr instead of stdout.
 */
export function setMcpMode(enabled: boolean): void {
  mcpMode = enabled;
}

/**
 * Check if MCP mode is enabled.
 */
export function isMcpMode(): boolean {
  return mcpMode;
}

/**
 * Log a message. In MCP mode, goes to stderr.
 */
export function log(...args: unknown[]): void {
  if (mcpMode) {
    console.error(...args);
  } else {
    console.log(...args);
  }
}

/**
 * Log a warning. Always goes to stderr.
 */
export function warn(...args: unknown[]): void {
  console.warn(...args);
}

/**
 * Log an error. Always goes to stderr.
 */
export function error(...args: unknown[]): void {
  console.error(...args);
}

/**
 * Create a prefixed logger for a specific module.
 */
export function createLogger(prefix: string) {
  return {
    log: (...args: unknown[]) => log(prefix, ...args),
    warn: (...args: unknown[]) => warn(prefix, ...args),
    error: (...args: unknown[]) => error(prefix, ...args),
  };
}

