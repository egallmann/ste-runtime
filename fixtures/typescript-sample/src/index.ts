/**
 * Main entry point for TypeScript sample.
 */

export { User, UserService, CreateUserDto, createUserService } from './user.service.js';

export const VERSION = '1.0.0';

export function main(): void {
  console.log(`TypeScript Sample v${VERSION}`);
}


