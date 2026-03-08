# E-ADR-005: JSON Data Model and Configuration Extraction

**Status:** Proposed  
**Implementation:**  Complete  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Next Step:** Validate extraction patterns against ste-spec requirements for ADR graduation.

---

## Context

Many enterprise codebases contain JSON files with semantic value beyond simple configuration:

| Category | Examples | Semantic Value |
|----------|----------|----------------|
| Controls/Rules Catalog | Security controls, compliance rules, policy definitions | High - governance metadata |
| Data Schemas | Entity definitions, API contracts, validation schemas | High - data contracts |
| Deployment Parameters | CFN parameters, environment configs, feature flags | High - deployment configuration |
| Reference Data | Seed data, lookup tables, static catalogs | Medium - reference data |
| Test Fixtures | Mock data, test inputs | Low - test data |
| Package Manifests | `package.json`, `tsconfig.json` | Low - tooling configuration |

Currently, RECON extracts:
- Python code (functions, classes, imports, SDK usage, API endpoints)
- TypeScript code (functions, classes, imports)
- CloudFormation templates (resources, outputs, parameters, GSIs)

**JSON files are not extracted**, leaving semantic gaps:
- Infrastructure resources may reference control/rule IDs, but definitions are not in the graph
- Data schemas define entity structure, but schemas are not linked to code that uses them
- Deployment parameters configure resources, but parameter values are not visible

The question arose: Should RECON extract JSON data models and configuration files?

---

## Decision

**RECON will extract JSON files with semantic structure, producing AI-DOC slices for data models and configuration.**

Extraction scope (configurable per project):

| JSON Category | Extract? | Domain | Type | Rationale |
|---------------|----------|--------|------|-----------|
| Controls/Rules Catalog |  Yes | `data` | `control` | Links resources to governance definitions |
| Data Schemas |  Yes | `data` | `schema` | Defines entity contracts |
| Deployment Parameters |  Yes | `infrastructure` | `config` | Deployment configuration |
| Reference Data |  Selective | `data` | `reference` | Only if referenced by code |
| Test Fixtures |  No | - | - | Test data, not semantic |
| Package Manifests |  No | - | - | Tooling configuration, not semantic |

---

## Rationale

### 1. Controls Catalog Bridges Infrastructure and Governance

Many projects maintain catalogs of controls, rules, or policies. Infrastructure resources implement these controls, but the semantic link is often missing:

```
Current State:
  CFN Resource (DataTable) ──?──> Control Definition (???)

After Extraction:
  CFN Resource (DataTable) ───────> Control (security-control/v/1.0.0/S3.1)
```

This enables queries like:
- "What resources implement control S3.1?"
- "What controls apply to the DataTable?"
- "Show blast radius of changing control SC-123"

### 2. Data Schemas Define Entity Contracts

Data schema files define the structure of entities (DynamoDB tables, API payloads, etc.):

```json
{
  "entity": "Order",
  "attributes": ["orderId", "customerId", "status", "items"],
  "keys": { "pk": "orderId", "sk": "customerId" }
}
```

Extracting schemas enables:
- Linking code that reads/writes entities to their schemas
- Validating that functions respect entity contracts
- Detecting schema drift between code and definition

### 3. Deployment Parameters Are Configuration

Parameter files define environment-specific configuration:

```json
{
  "Environment": "prod",
  "TableReadCapacity": "100",
  "EnableStream": "true"
}
```

Extracting parameters enables:
- Linking templates to their parameter sets
- Understanding deployment configuration by environment
- Detecting configuration drift

---

## Specification

### §5.1 JSON Discovery

JSON files are discovered using configurable patterns in `ste.config.json`:

```json
{
  "languages": ["typescript", "python", "cloudformation", "json"],
  "jsonPatterns": {
    "controls": "**/controls/**/*.json",
    "schemas": "**/schemas/**/*.json",
    "parameters": "**/parameters/**/*.json"
  }
}
```

Default ignore patterns:

```typescript
const JSON_IGNORES = [
  '**/package.json',
  '**/package-lock.json',
  '**/tsconfig.json',
  '**/angular.json',
  '**/*.test.json',
  '**/fixtures/**',
  '**/node_modules/**',
];
```

### §5.2 Controls Catalog Extraction

Controls catalog files follow a known structure:

```json
{
  "controlId": "security-framework/v/1.0.0/S3.1",
  "title": "S3 buckets should have server-side encryption enabled",
  "severity": "MEDIUM",
  "service": "S3",
  "complianceFrameworks": ["FRAMEWORK-A", "FRAMEWORK-B"],
  "remediationGuidance": "..."
}
```

**Extracted Slice:**

```yaml
_slice:
  id: control:security-framework/v/1.0.0/S3.1
  domain: data
  type: control
  source_files:
    - data/controls/s3/S3.1.json
  tags:
    - service:s3
    - severity:medium
    - framework:framework-a
    - framework:framework-b

element:
  controlId: security-framework/v/1.0.0/S3.1
  title: S3 buckets should have server-side encryption enabled
  severity: MEDIUM
  service: S3
  complianceFrameworks:
    - FRAMEWORK-A
    - FRAMEWORK-B
```

### §5.3 Data Schema Extraction

Data schema files define entity structure:

```json
{
  "$schema": "...",
  "entity": "Order",
  "tableName": "OrdersTable",
  "attributes": [
    { "name": "orderId", "type": "string", "required": true },
    { "name": "customerId", "type": "string", "required": true }
  ],
  "keys": {
    "partitionKey": "orderId",
    "sortKey": "customerId"
  }
}
```

**Extracted Slice:**

```yaml
_slice:
  id: schema:Order
  domain: data
  type: schema
  source_files:
    - data/schemas/order-schema.json
  references:
    - domain: infrastructure
      type: resource
      id: cfn_resource:cloudformation/infrastructure.yaml:OrdersTable
  tags:
    - entity:order
    - table:orderstable

element:
  entity: Order
  tableName: OrdersTable
  attributes:
    - name: orderId
      type: string
      required: true
    - name: customerId
      type: string
      required: true
  keys:
    partitionKey: orderId
    sortKey: customerId
```

### §5.4 CFN Parameters Extraction

Parameter files configure deployments:

```json
{
  "Parameters": [
    { "ParameterKey": "Environment", "ParameterValue": "prod" },
    { "ParameterKey": "TableReadCapacity", "ParameterValue": "100" }
  ]
}
```

**Extracted Slice:**

```yaml
_slice:
  id: config:cloudformation/parameters/prod-infrastructure.json
  domain: infrastructure
  type: config
  source_files:
    - cloudformation/parameters/prod-infrastructure.json
  references:
    - domain: infrastructure
      type: template
      id: cfn_template:cloudformation/infrastructure.yaml:main
  tags:
    - env:prod
    - config:parameters

element:
  environment: prod
  parameters:
    Environment: prod
    TableReadCapacity: "100"
```

### §5.5 Inference: Controls to Resources

During inference phase, link controls to resources:

1. Extract `controlId` references from CloudFormation resource tags or metadata
2. Link CFN resources to control slices
3. Enable bidirectional traversal:
   - Resource → "implements" → Control
   - Control → "implemented_by" → Resources

---

## Implementation

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/extractors/json/json-extractor.ts` | Create | JSON extraction logic |
| `src/extractors/json/controls-extractor.ts` | Create | Controls catalog extraction |
| `src/extractors/json/schema-extractor.ts` | Create | Data schema extraction |
| `src/extractors/json/params-extractor.ts` | Create | CFN parameters extraction |
| `src/extractors/json/index.ts` | Create | Extractor exports |
| `src/config/index.ts` | Modify | Add `json` to SupportedLanguage |
| `src/recon/phases/discovery.ts` | Modify | Add JSON patterns |
| `src/recon/phases/extraction.ts` | Modify | Route JSON files to extractor |
| `src/recon/phases/normalization.ts` | Modify | Normalize JSON assertions |
| `src/recon/phases/inference.ts` | Modify | Link controls to resources |

### Configuration

Add to `ste.config.json`:

```json
{
  "languages": ["typescript", "python", "cloudformation", "json"],
  "jsonPatterns": {
    "controls": "**/controls/**/*.json",
    "schemas": "**/schemas/**/*.json",
    "parameters": "**/parameters/**/*.json"
  }
}
```

---

## Constraints

1. **Schema Detection**: JSON files must be identified by path pattern, not content inspection (unlike CloudFormation which checks for `AWSTemplateFormatVersion`).

2. **Versioned Controls**: Control IDs may contain version strings. ID stability must account for version changes.

3. **Environment-Specific Parameters**: Parameter files are environment-specific. Tags must capture environment.

4. **No Deep Validation**: Extractor reads structure, does not validate correctness of control definitions or schema syntax.

5. **Project-Specific Patterns**: JSON patterns are configured per-project in `ste.config.json`, not hardcoded.

---

## Consequences

### Positive

- Controls catalog becomes queryable via RSS
- Resource → Control relationships are explicit
- Data schemas linked to infrastructure
- Deployment parameters visible as configuration

### Negative

- Increased extraction time
- JSON structure variance may cause extraction errors
- Path-based detection requires configuration

### Mitigation

- JSON patterns configurable in `ste.config.json`
- Graceful handling of malformed JSON
- Validation report includes JSON extraction coverage

---

## Relationship to Other Decisions

- **E-ADR-001 (RECON Provisional Execution)**: JSON extraction follows same provisional model
- **E-ADR-002 (RECON Self-Validation)**: Validation covers JSON extraction quality
- **E-ADR-004 (RSS CLI)**: JSON entities queryable via RSS

---

## Acceptance Criteria

1. RECON discovers and extracts controls catalog files (when configured)
2. RECON discovers and extracts data schema files (when configured)
3. RECON discovers and extracts CFN parameter files (when configured)
4. Extracted slices appear in RSS graph (`rss stats` shows `control`, `schema`, `config` types)
5. RSS query `rss search "<control-id>"` returns control slice
6. RSS query `rss by-tag "service:<service>"` returns service-related controls
7. Inference links CFN resources to controls (bidirectional)

---

## Review Trigger

This decision should be revisited when:

1. JSON structure requirements change
2. New JSON data categories emerge
3. Extraction accuracy falls below acceptable threshold
4. Performance impact is prohibitive

---

## References

- STE Architecture Specification, Section 4.5: RECON
- E-ADR-001: Provisional Execution of RECON
- E-ADR-004: RSS CLI Implementation
