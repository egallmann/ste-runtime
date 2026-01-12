# AI-DOC State Directory

This directory contains the semantic state extracted by the RECON engine.

## Purpose

When ste-runtime analyzes a project, it generates AI-DOC slices organized by domain and type. This directory structure shows where those slices will be persisted.

## Directory Structure

```
.ste/state/
├── graph/              # Code structure slices
│   ├── modules/        # Module/file-level metadata
│   ├── functions/      # Function definitions and signatures
│   └── classes/        # Class definitions and relationships
├── api/                # API endpoint slices
│   └── endpoints/      # REST/GraphQL endpoint definitions
├── data/               # Data model slices
│   └── entities/       # Entity schemas and relationships
├── infrastructure/     # Infrastructure-as-code slices
│   ├── templates/      # CloudFormation templates
│   └── resources/      # Infrastructure resource definitions
└── behavior/           # Runtime behavior slices
    ├── sdk_usage/      # AWS SDK and library usage patterns
    ├── env_vars/       # Environment variable usage
    └── call_graph/     # Function call relationships
```

## Slice Format

Each slice is a YAML file with:
- **Content-addressable filename**: Hash of the slice ID (prevents path length issues)
- **Semantic metadata**: Domain, type, tags, relationships
- **Source attribution**: File path, line numbers, checksum

Example slice structure:
```yaml
_slice:
  id: "function:src/module.ts:functionName"
  domain: "backend"
  type: "function"
  tags:
    - "backend:api"
    - "typescript"
_source:
  files:
    - "src/module.ts"
  checksum: "abc123..."
# ... semantic content ...
```

## Usage

This directory is automatically populated when running RECON:

```bash
node dist/cli/recon-cli.js --mode=full /path/to/project
```

## Portability

The `.ste/state` directory can be:
- Committed to version control (for team AI-DOC state)
- Excluded via `.gitignore` (regenerate on-demand)
- Archived for historical analysis
- Cleared and regenerated at any time (slices are derived artifacts per E-ADR-001)

## Examples

For complete examples of real slices, see the `.ste-self/state` directory, which contains ste-runtime's own self-analysis.

## Related Documentation

- **E-ADR-001**: AI-DOC State Management
- **E-ADR-002**: RECON Reconciliation Engine
- **E-ADR-009**: Self-Configuring Domain Discovery



