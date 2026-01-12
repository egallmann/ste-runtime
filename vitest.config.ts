import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use the src directory as root for tests
    root: '.',
    
    // Include test files pattern
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    
    // Exclude patterns
    exclude: ['node_modules', 'dist', '.ste', '.ste-self', 'fixtures'],
    
    // Enable globals for describe, it, expect without imports
    globals: true,
    
    // Use node environment for backend testing
    environment: 'node',
    
    // Test timeout (some integration tests may take longer)
    testTimeout: 30000,
    
    // Hook timeout for beforeAll/afterAll
    hookTimeout: 30000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'node_modules/**',
      ],
    },
    
    // Resolve aliases for cleaner imports
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
    
    // Pool configuration for parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    
    // Reporter configuration
    reporters: ['default'],
    
    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,
  },
});

