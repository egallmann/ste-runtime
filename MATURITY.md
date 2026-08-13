# ste-runtime maturity

## Current posture

ste-runtime is a functioning experimental/reference implementation with
meaningful supervised workspace use documented in repository history. It is
not a production-supported public package.

The current boundaries are:

- **Implementation:** RECON, RSS, workspace graph queries, local MCP/watch,
  and runtime architecture evidence are implemented capabilities.
- **Execution:** human-in-the-loop supervision is required. Autonomous agent
  execution is not supported.
- **Distribution:** `package.json` remains `private: true`; the package is
  unpublished and must not be treated as an npm dependency.
- **Public API:** source exports are available for local experiments, but no
  production compatibility or support commitment exists.
- **Security:** the runtime is a local, single-user tool with project-boundary
  controls. It is not presented as a hardened multi-user or hostile-input
  service.

This distinction is required by
[ADR-L-0024](adrs/adr-projection/logical/ADR-L-0024-public-source-release-and-production-publication-boundary.md).

## Capabilities currently suitable for supervised use

- Extracting supported source and ADR inputs into derived semantic state.
- Querying bounded per-repository RSS graphs.
- Building and querying configured multi-repository workspace graphs.
- Running local MCP integration and optional file watching.
- Compiling canonical ADR inputs into runtime-owned machine artifacts.
- Emitting runtime architecture evidence for downstream consumers.

These capabilities describe the current implementation surface. They do not
establish a package release, service-level guarantee, or autonomous execution
authority.

## Known limitations

- CEM substrate exists, but invariant-based validation over CEM outputs is not
  operationalized as an autonomous control boundary.
- Human review remains required for extracted state, query context, MCP tool
  calls, file watching, and generated code.
- Extractor completeness and validation depth vary across languages and
  artifact types.
- Error recovery and graceful degradation for partial extractor failures are
  not universal guarantees.
- The local execution model inherits the user's operating-system permissions
  and is not a multi-user isolation boundary.
- The package is private and unpublished; consumers must use a source checkout
  or local linking for experimentation.

## Security posture

MCP is designed as a local stdio process, not a network service. Current
boundary enforcement limits project discovery and file scanning to configured
scope, but this does not provide authentication, authorization, secrets
management, destructive-operation protection, or hostile-input hardening for a
general service deployment.

Technical details are documented in
[boundary-enforcement.md](documentation/security/boundary-enforcement.md).

No confidential vulnerability-reporting channel is currently documented for
this repository. Do not disclose sensitive issues in public issue reports;
establish a private reporting path before publishing a formal security policy.

## Current quality evidence

This refresh uses durable validation outcomes rather than carrying forward
the former dated test-count, coverage, benchmark, LOC, state-size, or failing-
test snapshots. The current repository quality evidence is the result of the
following gates run against this change:

- dependency installation with `npm ci`;
- TypeScript build with `npm run build`;
- unit/integration tests with `npm test` and `npm run test:integration`;
- contract guards with `npm run test:contract-guards`;
- lint with `npm run lint`;
- release-boundary validation with `npm run release:check`;
- RECON self-documentation with `npm run recon:self`;
- ADR validation with `adr validate --scope . --cross-references`.

Point-in-time counts and performance measurements belong in dated benchmark or
CI evidence, not in this current posture summary unless reproduced and
explicitly dated.

## Support boundary

Public source availability means that the code, canonical ADRs, and generated
public artifacts can be inspected and experimented with. It does not mean
that an npm package is available, that source exports are compatibility
stable, or that the maintainers provide production support.

Runtime changes follow the reviewed feature → `develop` → `main` promotion
path. Package publication remains deferred until a separate production
overhaul establishes a supported API, compatibility policy, release evidence,
publication provenance, and support expectations.

## What maturation still means

Future maturation work may address stronger invariant validation, error
recovery, extractor completeness, security hardening, compatibility policy,
release evidence, and package publication. Those are deliberately outside
this documentation coherence change.

## Related documentation

- [README.md](README.md) - public landing page
- [CONTRIBUTING.md](CONTRIBUTING.md) - development workflow
- [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md) - artifact authority
- [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md) - generated orientation
- [Architecture guide](documentation/architecture.md) - technical details
- [ADR directory](adrs/) - canonical architecture source
