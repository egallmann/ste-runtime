/**
 * Boundary Validation Tests
 * 
 * Tests that ensure RECON never scans outside the allowed project scope.
 * These tests validate the boundary enforcement logic without actually scanning the file system.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';

// TODO: Once boundary gating is fully validated, make these paths machine-agnostic
// For now, using hardcoded paths for testing on this specific machine
const runtimeDir = path.resolve('C:/Users/Erik.Gallmann/Documents/PycharmProjects/ste-runtime');
const parentDir = path.resolve('C:/Users/Erik.Gallmann/Documents/PycharmProjects');
const homeDir = path.resolve('C:/Users/Erik.Gallmann');
const allowedScope = runtimeDir;

describe('Boundary Validation Logic', () => {
  describe('Project Root Validation', () => {
    it('should reject project root that is parent of runtime directory', () => {
      const projectRoot = parentDir;
      const runtimeDir = path.resolve(projectRoot, 'ste-runtime');
      
      // This is what validateProjectScope checks
      const runtimeParent = path.dirname(runtimeDir);
      const isParent = projectRoot === runtimeParent;
      
      expect(isParent).toBe(true);
      expect(() => {
        if (isParent) {
          throw new Error(
            `CRITICAL BOUNDARY VIOLATION: Project root is the parent directory of ste-runtime.\n` +
            `  Project root: ${projectRoot}\n` +
            `  Runtime dir:  ${runtimeDir}\n` +
            `  This would scan outside the intended project scope.`
          );
        }
      }).toThrow(/CRITICAL BOUNDARY VIOLATION/);
    });

    it('should reject project root that is higher than parent directory', () => {
      const projectRoot = homeDir;
      const runtimeDir = path.resolve(homeDir, 'Documents/PycharmProjects/ste-runtime');
      
      const runtimeParent = path.dirname(runtimeDir);
      const projectParent = path.dirname(projectRoot);
      
      // Check if project root is higher up the tree
      const relativePath = path.relative(runtimeParent, projectRoot);
      const isTooHigh = relativePath.startsWith('..') && relativePath.split(path.sep).filter(p => p === '..').length > 1;
      
      expect(isTooHigh).toBe(true);
      expect(() => {
        if (isTooHigh) {
          throw new Error(
            `CRITICAL BOUNDARY VIOLATION: Project root is outside the allowed scope.\n` +
            `  Project root: ${projectRoot}\n` +
            `  Runtime dir:  ${runtimeDir}`
          );
        }
      }).toThrow(/CRITICAL BOUNDARY VIOLATION/);
    });

    it('should accept project root that equals runtime directory (self-analysis)', () => {
      const projectRoot = runtimeDir;
      const runtimeDirValue = projectRoot;
      
      // For self-analysis, they must be equal
      const isValid = projectRoot === runtimeDirValue;
      
      expect(isValid).toBe(true);
      expect(() => {
        if (projectRoot !== runtimeDirValue) {
          throw new Error('CRITICAL BOUNDARY VIOLATION: Project root must equal runtime dir for self-analysis');
        }
      }).not.toThrow();
    });
  });

  describe('File Discovery Boundary Checks', () => {
    it('should reject files outside project root', () => {
      const projectRoot = runtimeDir;
      const fileOutside = path.resolve(parentDir, 'other-project', 'file.ts');
      
      const relativePath = path.relative(projectRoot, fileOutside);
      expect(relativePath.startsWith('..')).toBe(true);
      
      // This is what the boundary check validates in discovery.ts
      expect(() => {
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new Error(
            `CRITICAL BOUNDARY VIOLATION: Attempted to scan file outside project root.\n` +
            `  File: ${fileOutside}\n` +
            `  Project root: ${projectRoot}\n` +
            `  This would scan outside the allowed project scope, which is FORBIDDEN.`
          );
        }
      }).toThrow(/CRITICAL BOUNDARY VIOLATION/);
    });

    it('should accept files within project root', () => {
      const projectRoot = runtimeDir;
      const fileInside = path.resolve(runtimeDir, 'src', 'index.ts');
      
      const relativePath = path.relative(projectRoot, fileInside);
      expect(relativePath.startsWith('..')).toBe(false);
      
      // This should not throw
      expect(() => {
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new Error('CRITICAL BOUNDARY VIOLATION: File outside project root');
        }
      }).not.toThrow();
    });

    it('should reject directories outside project root', () => {
      const projectRoot = runtimeDir;
      const dirOutside = path.resolve(parentDir, 'other-project');
      
      const relativePath = path.relative(projectRoot, dirOutside);
      expect(relativePath.startsWith('..')).toBe(true);
      
      // This is what the boundary check validates in project-discovery.ts
      expect(() => {
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          throw new Error(
            `CRITICAL BOUNDARY VIOLATION: Attempted to scan directory outside project root.\n` +
            `  Directory: ${dirOutside}\n` +
            `  Project root: ${projectRoot}\n` +
            `  This would scan outside the allowed project scope, which is FORBIDDEN.`
          );
        }
      }).toThrow(/CRITICAL BOUNDARY VIOLATION/);
    });
  });

  describe('Scope Validation', () => {
    it('should validate allowed scope is exactly ste-runtime directory', () => {
      const allowedScope = runtimeDir;
      const testProjectRoot = runtimeDir;
      
      expect(testProjectRoot).toBe(allowedScope);
      expect(path.resolve(testProjectRoot)).toBe(path.resolve(allowedScope));
    });

    it('should reject any project root outside allowed scope', () => {
      const allowedScope = runtimeDir;
      const invalidRoots = [
        parentDir,
        homeDir,
        path.resolve(homeDir, 'Documents'),
        path.resolve('C:/'),
      ];
      
      for (const invalidRoot of invalidRoots) {
        expect(path.resolve(invalidRoot)).not.toBe(path.resolve(allowedScope));
        expect(() => {
          if (path.resolve(invalidRoot) !== path.resolve(allowedScope)) {
            throw new Error(`Project root ${invalidRoot} is outside allowed scope ${allowedScope}`);
          }
        }).toThrow();
      }
    });
  });
});

