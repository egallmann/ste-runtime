# Contributing to STE Runtime

## Current Status

**STE Runtime is currently in active development and not accepting external contributions at this time.**

This repository is being published to document a stable implementation that converges with the [STE Specification](https://github.com/egallmann/ste-spec). The codebase is still evolving, and significant changes are planned.

**This contributing guide is provided for future reference** when the project is ready to accept contributions. The structure and standards documented here represent the intended contribution process for when that time comes.

---

## For Future Contributors

When STE Runtime is ready to accept contributions, this guide will outline the development process, code standards, and contribution workflow.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Extractor Development](#extractor-development)

---

## Code of Conduct

This project adheres to professional standards:

- **Be respectful** - Treat all contributors with respect
- **Be constructive** - Provide helpful feedback
- **Be professional** - Maintain enterprise-grade code quality
- **Be collaborative** - Work together to improve the project

---

## Getting Started

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn**
- **Git**
- **TypeScript** knowledge
- **Python 3.x** (for Python extractor development)

### Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/your-username/ste-runtime.git
cd ste-runtime

# Add upstream remote
git remote add upstream https://github.com/egallmann/ste-runtime.git
```

---

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### 4. Verify Setup

```bash
# Test self-documentation
npm run recon:self

# Check RSS stats
npm run rss:stats
```

---

## Project Structure

```
ste-runtime/
├── src/                    # TypeScript source code
│   ├── cli/               # CLI entry points
│   ├── config/            # Configuration loader
│   ├── extractors/       # Language extractors
│   ├── mcp/              # MCP server
│   ├── recon/            # RECON engine
│   ├── rss/              # RSS operations
│   ├── watch/            # File watching (watchdog)
│   └── test/             # Test utilities
├── python-scripts/        # Python AST parser
├── fixtures/              # Test fixtures
├── documentation/        # Documentation
│   ├── e-adr/           # Architectural decisions
│   ├── guides/          # User guides
│   └── reference/       # Technical reference
├── instructions/         # Usage instructions
└── scripts/              # Utility scripts
```

---

## Development Workflow

### 1. Create a Branch

```bash
# From main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation
- `refactor/` - Code refactoring
- `test/` - Test improvements

### 2. Make Changes

- Write code following [Code Style](#code-style)
- Add tests for new features
- Update documentation as needed
- Follow [Git Commit Standards](#commit-messages)

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/your-file.test.ts

# Check coverage
npm run test:coverage

# Verify build
npm run build

# Test RECON
npm run recon:self
```

### 4. Pre-Commit Checks

The pre-commit hook automatically runs:

1. **Build check** - TypeScript compilation
2. **RECON self-check** - Self-documentation
3. **Tests** - All test suites
4. **RSS stats** - RSS functionality
5. **Test coverage** - Minimum 50% coverage

**To bypass (not recommended):**
```bash
git commit --no-verify
```

### 5. Commit Your Changes

Follow [Git Commit Standards](#commit-messages):

```bash
git add .
git commit -m "PROJECT-1234 Add feature description"
```

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## Code Style

### TypeScript

- **Formatting:** Use Prettier (configured) or match existing style
- **Naming:**
  - `camelCase` for variables and functions
  - `PascalCase` for classes and types
  - `UPPER_SNAKE_CASE` for constants
- **Imports:** Group by type (external, internal, types)
- **Comments:** JSDoc for public APIs

**Example:**
```typescript
/**
 * Extracts semantic assertions from a TypeScript file.
 * 
 * @param filePath - Absolute path to the TypeScript file
 * @param content - File content as string
 * @param projectRoot - Project root directory
 * @returns Array of raw semantic assertions
 */
export async function extractTypeScript(
  filePath: string,
  content: string,
  projectRoot: string
): Promise<RawAssertion[]> {
  // Implementation
}
```

### File Organization

- One class/interface per file (when possible)
- Related utilities grouped together
- Test files: `*.test.ts` next to source files

### Error Handling

- Use descriptive error messages
- Include context (file path, line number)
- Don't swallow errors silently

**Example:**
```typescript
if (!fileExists) {
  throw new Error(
    `File not found: ${filePath}\n` +
    `Project root: ${projectRoot}\n` +
    `This file should exist for extraction to proceed.`
  );
}
```

---

## Testing

### Test Structure

```typescript
import { describe, it, expect } from 'vitest';

describe('FeatureName', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Test Requirements

- **Unit tests** for all new functions
- **Integration tests** for complex workflows
- **Edge cases** covered
- **Error cases** tested

### Running Tests

```bash
# All tests
npm test

# Watch mode (development)
npm run test:watch

# Specific file
npm test -- src/path/to/file.test.ts

# Coverage report
npm run test:coverage
```

### Coverage Requirements

- **Minimum:** 50% statement coverage
- **Target:** 70%+ for new code
- **Critical paths:** 90%+ (extractors, RECON phases)

---

## Documentation

### When to Update Documentation

**Always update documentation when:**
- Adding new features
- Changing APIs
- Modifying configuration
- Adding new extractors
- Changing behavior

### Documentation Types

1. **User Guides** (`documentation/guides/`)
   - Setup instructions
   - Usage examples
   - Configuration reference

2. **E-ADRs** (`documentation/e-adr/`)
   - Architectural decisions
   - Design rationale

3. **Reference** (`documentation/reference/`)
   - Technical deep-dives
   - Implementation details

4. **Instructions** (`instructions/`)
   - CLI usage
   - API documentation

### Documentation Standards

- **Clear and concise** - Explain concepts simply
- **Examples** - Include code examples
- **Cross-references** - Link related docs
- **Professional tone** - Enterprise-grade writing

---

## Pull Request Process

### Before Submitting

1. **Update documentation** - Add/update relevant docs
2. **Add tests** - Ensure all tests pass
3. **Check coverage** - Maintain or improve coverage
4. **Run pre-commit** - All checks must pass
5. **Self-review** - Review your own changes

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] Coverage maintained

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] Pre-commit checks passing
- [ ] No breaking changes (or documented)
```

### Review Process

1. **Automated checks** - CI/CD runs tests
2. **Code review** - Maintainer reviews code
3. **Feedback** - Address review comments
4. **Approval** - Maintainer approves
5. **Merge** - Squash and merge (preferred)

---

## Commit Messages

Follow the Git Commit Message Standards:

**Format:**
```
JIRA-1234 Brief summary (50 chars max)

Optional detailed explanation of what and why.
```

**Examples:**
```
PROJECT-4030 Add indirect employment verification

Implemented verification flow with API integration.
```

```
PROJECT-4055 Fix Python extractor import resolution

Resolved issue where relative imports weren't creating
graph edges. Added resolvePythonRelativeImport function.
```

**Rules:**
- Start with JIRA ticket ID
- Use imperative mood ("Add" not "Added")
- Capitalize first word after ticket ID
- No period at end of summary
- Add body for complex changes

---

## Extractor Development

### Creating a New Extractor

1. **Study existing extractors:**
   - `src/extractors/typescript/` - AST-based
   - `src/extractors/python/` - Subprocess-based

2. **Follow E-ADR-008:**
   - [Extractor Development Guide](documentation/e-adr/E-ADR-008-Extractor-Development-Guide.md)

3. **Create extractor:**
   ```bash
   mkdir src/extractors/mylanguage/
   # Create extractor files
   ```

4. **Add validation tests:**
   - See [Extractor Validation Quickstart](documentation/guides/extractor-validation-quickstart.md)

5. **Register extractor:**
   - Update `src/discovery/` to detect language
   - Update `src/recon/phases/extraction.ts`
   - Add to `SupportedLanguage` enum

### Extractor Requirements

- **Extract semantics** - Not syntax
- **Handle errors** - Don't crash on invalid code
- **Create relationships** - Emit import/dependency assertions
- **Validation tests** - Pass all validation requirements
- **Documentation** - Document extraction patterns

---

## Common Development Tasks

### Adding a New Feature

1. Create feature branch
2. Implement feature
3. Add tests
4. Update documentation
5. Run pre-commit checks
6. Create PR

### Fixing a Bug

1. Create fix branch
2. Write failing test (if possible)
3. Fix bug
4. Verify test passes
5. Update documentation if behavior changed
6. Create PR

### Refactoring

1. Create refactor branch
2. Ensure tests cover area
3. Refactor incrementally
4. Keep tests passing
5. Update documentation if APIs change
6. Create PR

---

## Getting Help

### Questions?

- **Documentation:** Check `documentation/` and `instructions/`
- **E-ADRs:** See `documentation/e-adr/` for design decisions
- **Issues:** Search existing issues before creating new ones

### Reporting Bugs

Include:
- ste-runtime version: `ste --version`
- Node.js version: `node --version`
- Error messages (full output)
- Steps to reproduce
- Configuration (sanitized)

### Feature Requests

Include:
- Use case description
- Expected behavior
- Why it's valuable
- Potential implementation approach

---

## Recognition

When contributions are accepted, contributors will be recognized in:
- `CONTRIBUTORS.md` (if created)
- Release notes
- Project documentation

---

## License

STE Runtime is licensed under the Apache 2.0 License.

---

## Questions or Feedback?

While external contributions are not currently being accepted, questions, feedback, and discussions are welcome through:
- GitHub Issues (for bug reports and feature requests)
- Documentation improvements (via issues or discussions)

---

**Note:** This guide will be updated when the project is ready to accept contributions. Thank you for your interest in STE Runtime!

