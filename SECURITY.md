# Security Policy

## Project Security Posture

`ste-runtime` is a public, experimental reference implementation of the
System of Thought Engineering runtime.

It is intended for local, human-supervised use. It is not published as an npm
package and is not presented as a hardened multi-user, network-facing, or
hostile-input service.

The project nevertheless treats vulnerabilities in its supported execution
model seriously and welcomes responsible security reports.

For additional context, see [MATURITY.md](MATURITY.md) and
[boundary enforcement](documentation/security/boundary-enforcement.md).

## Supported Versions

`ste-runtime` does not currently publish supported package releases.

Security reports should be evaluated against the current `main` branch.
Historical revisions, experimental branches, and unpublished package
versions do not receive a compatibility or security-backport commitment.

When the project begins publishing supported releases, this section will be
replaced with an explicit supported-version policy.

## Reporting a Vulnerability

**Do not report security vulnerabilities containing sensitive details through
public GitHub issues, discussions, or pull requests.**

Use the repository's [GitHub Security advisories](https://github.com/egallmann/ste-runtime/security/advisories)
area and choose **Report a vulnerability**. GitHub private vulnerability
reporting is enabled for this repository, so the report is delivered privately
to the maintainers.

Include, when available:

- A description of the vulnerability and potential impact.
- The affected component or execution path.
- Steps to reproduce or a minimal proof of concept.
- Relevant operating-system or environment details.
- Whether the issue can cross an intended repository, filesystem, process, or
  trust boundary.
- Any known mitigations or suggested remediation.

Reports will be reviewed on a best-effort basis appropriate to the project's
experimental status. No response-time or remediation SLA is currently
offered.

## Security-Relevant Scope

Security issues may include, but are not limited to:

- **Project or filesystem boundary escape:** reading, scanning, modifying, or
  exposing files outside the configured project or workspace scope.
- **Path traversal or unsafe path resolution:** crafted repository, workspace,
  manifest, or configuration input that defeats intended path boundaries.
- **Sensitive information exposure:** secrets, credentials, private source,
  environment information, or other unintended data appearing in generated
  state, evidence, logs, or tool responses.
- **Unexpected code or command execution:** crafted input that causes
  execution beyond the behavior intentionally requested by the local operator.
- **MCP or tool-boundary violations:** behavior that permits a caller to exceed
  the authority or filesystem scope intended by supported local MCP integration.
- **Unsafe parsing or processing of repository input:** vulnerabilities in
  supported YAML, JSON, source, manifest, architecture, or other ingestion
  paths with a practical security impact.
- **Runtime dependency vulnerabilities:** vulnerabilities in dependencies that
  are reachable through supported `ste-runtime` execution paths.

## Current Trust Boundary

The current runtime assumes:

- local execution;
- a single user operating within their own operating-system permissions;
- human supervision;
- explicitly configured repository or workspace scope.

Project-boundary controls constrain repository discovery and file scanning, but
they do not provide a general-purpose sandbox, authentication system,
authorization service, secrets-management boundary, or multi-tenant isolation
mechanism. Running `ste-runtime` as a privileged user does not create an
additional isolation boundary; the process inherits the permissions of the
operating-system account that launches it.

## Out of Scope

The following are generally not treated as security vulnerabilities unless
they demonstrate a practical security impact within the supported execution
model:

- General correctness, extraction-quality, or architecture-analysis defects.
- Experimental or undocumented behavior without a security consequence.
- Attacks that require deploying `ste-runtime` as an unsupported public or
  multi-user network service.
- Purely theoretical vulnerabilities without a plausible exploit path.
- Vulnerabilities limited to development-only tooling that cannot affect
  runtime or distributed artifacts.
- Availability or performance issues that amount only to ordinary local
  resource consumption.

If you are unsure whether a finding is security-sensitive, use the private
reporting channel rather than opening a public issue.

## Responsible Disclosure

Please allow maintainers an opportunity to investigate and remediate a
reported vulnerability before publishing exploit details. When appropriate,
remediation and disclosure may be coordinated through a GitHub repository
security advisory.

Security fixes do not change the project's experimental maturity
classification or imply a production-support commitment.
