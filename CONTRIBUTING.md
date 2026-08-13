# Contributing to ste-runtime

## Current collaboration model

ste-runtime is a public experimental repository and reference implementation.
Maintainer-driven changes are the primary collaboration model. Bug reports,
questions, documentation feedback, architectural discussion, forks, and
downstream experiments are welcome; direct pull requests are not assumed to be
accepted without maintainer direction.

The package is `private: true` and unpublished. Local source checkout and
linking are the supported ways to experiment with it today.

## Local development

Prerequisites:

- Node.js 18 or later;
- npm;
- Python 3 for Python extractor development.

From the repository root:

```bash
npm ci
npm run build
npm run recon:self
npm run rss:stats
```

`npm ci` installs the repository hooks. They are implemented with Node.js and
do not require Bash, WSL, or a platform-specific shell. If hooks need repair:

```bash
node scripts/install-git-hooks.cjs
```

The automated bootstrap is also available:

```bash
npm run init
```

The package declares `ste`, `recon`, and `rss` binaries but is not published.
For local PATH access:

```bash
npm link
ste --help
```

Without linking, use `node dist/cli/index.js <command>` or the npm scripts.

## Validation

Run the relevant checks before proposing a change:

```bash
npm run build
npm test
npm run test:integration
npm run test:contract-guards
npm run lint
npm run release:check
npm run recon:self
adr validate --scope . --cross-references
```

Before ADR validation, use an ADR Kit CLI that supports the repository's ADR
Kit schema v1.3 records.

## Repository standards

- Keep changes focused and reviewable.
- Add or update tests when runtime behavior changes.
- Update documentation when CLI behavior, configuration, or architecture
  claims change.
- Do not change runtime behavior or public exports in a documentation-only
  change.
- Treat canonical ADR YAML under `adrs/` as architecture authority.
- Do not hand-edit `SYSTEM-OVERVIEW.md`, `adrs/manifest.yaml`,
  `adrs/adr-projection/`, runtime registries, or generated graph/state.
- Change canonical inputs and regenerate derived artifacts through their
  owning tools when an implementation change genuinely requires it.

## Architecture references

- Canonical ADRs: `adrs/`
- Generated ADR projections: `adrs/adr-projection/`
- Generated repository overview: `SYSTEM-OVERVIEW.md`
- Project metadata: `PROJECT.yaml`
- Runtime artifact authority: `COMPILER-AUTHORITY.md`
- Technical architecture: `documentation/architecture.md`

ADR Kit owns ADR authoring and schema-validation workflows. `ste-spec` owns
shared public contracts, ste-runtime owns runtime evidence and runtime-owned
machine artifacts, ste-kernel owns admission decisions, and
ste-rules-library provides advisory/custom governance rules.

## Branch and promotion workflow

Runtime changes follow the governed path:

```text
feature/* -> develop -> main
```

Start from an updated `develop`, open a reviewed feature PR into `develop`,
and use a separate reviewed promotion PR from `develop` to `main`. Feature
branches must not bypass `develop`.

## Reporting

For ordinary issues, include the repository revision, Node.js version, command
run, complete error output, and relevant configuration. Do not disclose
security-sensitive details in a public issue. A confidential vulnerability
reporting path is not currently documented for this repository and remains an
explicit infrastructure gap.

## License

Contributions and documentation feedback are provided under the Apache License
2.0 used by this repository. See [LICENSE](LICENSE).
