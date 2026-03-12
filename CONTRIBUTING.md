# Contributing to ste-runtime

## Current Status

ste-runtime is a public experimental repository and reference implementation. Direct pull requests are not the primary collaboration model right now.

What is welcome:
- Bug reports
- Questions about behavior or documentation
- Architectural discussion
- Forks and downstream experimentation

What to expect:
- Maintainer-driven changes land first
- The public repo may change quickly as the runtime is cleaned up and refactored
- Forks are the recommended path for custom features or production hardening

## Local Development

Prerequisites:
- Node.js 18 or later
- npm
- Python 3 for Python extractor development

Setup:

```bash
npm install
npm run build
npm run rss:stats
npm run recon:self
```

Useful commands:

```bash
npm test
npm run test:coverage
npm run recon:full
npm run recon:self
npm run rss:stats
```

## Repository Standards

- Keep changes focused and reviewable.
- Add or update tests when behavior changes.
- Update docs when CLI behavior, configuration, or architecture claims change.
- Prefer current ADR Kit records in `adrs/` and `SYSTEM-OVERVIEW.md` over legacy narrative docs.

## Architecture References

- Generated repo overview: `SYSTEM-OVERVIEW.md`
- Current ADRs: `adrs/`
- Rendered ADR docs: `adrs/rendered/`
- Project metadata: `PROJECT.yaml`
- Architecture overview: `documentation/architecture.md`

## Reporting Issues

When reporting a bug, include:
- ste-runtime version
- Node.js version
- command run
- full error output
- relevant config snippets

## License

By contributing ideas, issues, or documentation feedback, you agree that resulting project changes remain under the Apache 2.0 license used by this repository.
