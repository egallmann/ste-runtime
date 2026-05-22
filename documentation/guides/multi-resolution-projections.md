# Multi-Resolution Architecture Projections

## Overview

The multi-resolution projection system produces architecture views at five
deterministic resolution levels from the workspace semantic graph. Each level
serves a distinct audience and optimizes for different cognitive loads.

All compression is deterministic: same graph + same config produces identical
output. No LLM inference is involved at any resolution level.

## Resolution Levels

| Level | Name | Audience | Node Density | Edge Filtering |
| --- | --- | --- | --- | --- |
| L0 | System Context | Executives, architects | 1 node per repo | Cross-repo Tier 1 only |
| L1 | Service Topology | Platform engineers, DevOps | Service + aggregated infra groups | Tier 1-2, cross-repo Tier 4 |
| L2 | Capability Domains | Product owners, API consumers | Service + capability group nodes | Tier 1-3, cross-repo Tier 4 |
| L3 | Contract Integration | Integration engineers | All endpoints in capability subgraphs | All tiers (Tier 5 dashed) |
| L4 | Full Graph | Machine consumers, diff tools | All nodes | All edges, no suppression |

## Edge Tier Taxonomy

- **Tier 1 (architectural):** `calls`, `publishes`, `consumes`
- **Tier 2 (structural):** `deploys_to`, `invokes`
- **Tier 3 (contractual):** `has_contract`
- **Tier 4 (data):** `reads`, `writes`
- **Tier 5 (reference):** `references`

## File Structure

After `recon:workspace`, the `projections/` directory contains both existing L4
files (unchanged) and new multi-resolution files:

```
projections/
  system-context-L0.md                    # Workspace system context
  service-topology-L1.md                  # Service + infra aggregates
  capability-domains-L2.md                # Capability groups (workspace)
  capability-domains-L2-{repo}.md         # Per-repo capability breakdown
  contract-integration-L3.md              # Full endpoints in groups
  contract-integration-L3-{repo}.md       # Per-repo contract detail
  system-dependencies.md                  # L4 (unchanged)
  component-integration.md                # L4 (unchanged)
  component-integration-{repo}.md         # L4 (unchanged)
  architecture-overview.md                # L4 skeleton (unchanged)
```

## YAML Frontmatter

Every multi-resolution projection file includes metadata:

```yaml
---
projection_level: L2
projection_family: component-integration
projection_intent: "Capability domain topology for human architectural cognition"
source_query: componentIntegration
generation_timestamp: "2026-05-22T16:30:00Z"
derivation: deterministic
confidence: high
node_count: 15
edge_count: 12
compression_ratio: 0.18
generation_hash: "a1b2c3d4"
drill_down: "contract-integration-L3.md"
drill_up: "service-topology-L1.md"
---
```

## Navigation

Every projection file includes a navigation bar linking all resolution levels:

```
> **Resolution:** L0 [System Context](system-context-L0.md) | L1 [Service Topology](service-topology-L1.md) | **L2** Capabilities | L3 [Contracts](contract-integration-L3.md) | L4 [Full Graph](component-integration.md)
```

## MCP Tool Usage

The `ws_dependencies` and `ws_integration` MCP tools accept an optional
`resolution` parameter:

```
ws_integration({ repo: 'acmeapi', resolution: 'L2' })
```

Default remains L4. When resolution is specified, results route through the
compression engine before rendering.

## CLI Usage

```bash
ste ws deps --workspace .ste-workspace --resolution L0 --output mermaid
ste ws integration --workspace .ste-workspace --resolution L2 --output table
```

## Compression Algorithms

### Endpoint Path-Prefix Grouping (L2)

Extracts capability domain from endpoint node IDs:
1. Parse endpoint ID format: `Endpoint:{repo}:{method}:{path-segments}`
2. Extract second path segment after `api-`: `api-account-info` -> `Account`
3. Group endpoints sharing the same domain prefix
4. Emit aggregate node: `Account Domain (8 endpoints)`

Singletons (1 endpoint) are not grouped. Minimum group size is configurable
(default: 2).

### Same-Type Node Aggregation (L1)

Groups nodes of the same type within a repo when count >= threshold (default: 3):
`Lambdas (5)` instead of 5 individual Lambda nodes.

`StateMachine`, `Bucket`, and `Service` types are always rendered individually
(architecturally significant, low cardinality).

### Infrastructure Condensation (L0-L1)

Alarm/monitoring topics (`Topic` nodes with `alarm` or `monitor` in the ID)
are suppressed at L0-L1 to reduce noise.

### maxNodes Safety Valve

When compressed node count exceeds `maxNodes`, the engine automatically drops to
a lower resolution level with more aggressive aggregation thresholds.

## Projection Families

Five built-in projection families are registered:

| Family | Levels | Source Query |
| --- | --- | --- |
| architecture-overview | L0, L2 | componentIntegration |
| integration-topology | L1, L2, L3 | componentIntegration |
| dependency-projection | L0, L1 | systemDependencies |
| governance-projection | L0, L1 | componentIntegration |
| runtime-projection | L1, L2 | componentIntegration |

Custom families can be registered via `registerFamily()`.

## Extension

To add a new projection family:

```typescript
import { registerFamily, type ProjectionFamily } from './workspace/index.js';

const custom: ProjectionFamily = {
  id: 'my-custom-projection',
  name: 'My Custom Projection',
  supportedLevels: ['L0', 'L1'],
  sourceQuery: 'systemDependencies',
  fileNamePattern: (level, repo) => `custom-${level}${repo ? `-${repo}` : ''}.md`,
};

registerFamily(custom);
```

## Architecture Decision Records

- **ADR-L-0019:** Multi-Resolution Architecture Projection (logical)
- **ADR-PC-0010:** Semantic Compression Engine (physical-component)
- **ADR-L-0018 (amended):** Added multi-resolution as enabled capability
- **ADR-PC-0009 (amended):** Added COMP-0011 dependency and resolution API
