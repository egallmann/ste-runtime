# CloudFormation Dynamic Extractor

## Architecture: Spec-Driven Extraction

This extractor is designed to be **touch-free** - it automatically supports ALL CloudFormation resource types without code changes.

## Design Principles

### 1. Spec-Driven (No Hardcoding)

```
AWS CFN Resource Specification (JSON)
         │
         ▼
┌─────────────────────────────┐
│  cfn-spec-loader.ts         │  ← Loads/caches AWS spec
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  cfn-dynamic-extractor.ts   │  ← Extracts based on spec
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  cfn-relationship-infer.ts  │  ← Infers relationships
└─────────────────────────────┘
```

### 2. Data Sources

| Source | Purpose | Update Frequency |
|--------|---------|-----------------|
| CFN Resource Spec | Property schemas for all types | Weekly cache refresh |
| AWS Documentation MCP | Rich semantic context | On-demand lookup |
| Template content | Actual property values | Every RECON run |

### 3. CFN Resource Specification

AWS publishes a complete specification of all CloudFormation resources:

```
https://d1uauaxba7bl26.cloudfront.net/latest/gzip/CloudFormationResourceSpecification.json
```

This includes:
- **ResourceTypes**: All AWS::* resource types (700+)
- **Properties**: Schema for each property
- **Attributes**: Outputs like Arn, Id, etc.
- **Required**: Which properties are mandatory

Example entry:
```json
{
  "AWS::Lambda::Function": {
    "Documentation": "https://docs.aws.amazon.com/...",
    "Properties": {
      "FunctionName": {
        "Required": false,
        "Type": "String",
        "UpdateType": "Immutable"
      },
      "Handler": {
        "Required": false,
        "Type": "String"
      },
      "Environment": {
        "Required": false,
        "Type": "Environment"
      },
      "Role": {
        "Required": true,
        "Type": "String"
      }
    },
    "Attributes": {
      "Arn": { "PrimitiveType": "String" }
    }
  }
}
```

### 4. Extraction Strategy

#### Layer 1: Generic Property Capture (All Resources)
- Extract ALL properties from the template
- Convert intrinsic functions to readable strings
- Preserve structure for unknown types

#### Layer 2: Spec-Informed Enrichment
- Look up resource type in CFN spec
- Identify required vs optional properties
- Identify properties that are resource references (Type: "String" with typical Arn pattern)
- Tag with service taxonomy (Lambda, DynamoDB, etc.)

#### Layer 3: Relationship Inference
- Properties with `Ref:` or `GetAtt:` → dependency edges
- Properties ending in `Arn`, `Id`, `Name` → potential relationships
- `DependsOn` → explicit dependencies

### 5. Semantic Enrichment (Optional)

For richer understanding, the MCP servers can provide:
- Property descriptions from AWS documentation
- Best practices and common patterns
- Service-specific semantic meaning

This is **optional** - the extractor works without MCP, but MCP enriches context.

## File Structure

```
src/extractors/cfn/
├── cfn-spec-loader.ts       # Loads and caches CFN spec
├── cfn-dynamic-extractor.ts # Main extraction logic
├── cfn-relationship-infer.ts # Relationship detection
├── cfn-types.ts             # Type definitions
└── index.ts                 # Public API
```

## Usage

```typescript
import { extractFromCloudFormation } from './extractors/cfn';

// Automatically handles any CFN resource type
const assertions = await extractFromCloudFormation(file);
```

## Benefits

| Aspect | Before (Hardcoded) | After (Spec-Driven) |
|--------|-------------------|---------------------|
| New service support | Code change | Automatic |
| Property accuracy | Manual sync | AWS-authoritative |
| Maintenance | High | Zero |
| Coverage | ~13 services | 700+ services |
| Future-proof | No | Yes |

## Implementation Status

- [ ] cfn-spec-loader.ts - Load/cache CFN specification
- [ ] cfn-dynamic-extractor.ts - Spec-driven extraction
- [ ] cfn-relationship-infer.ts - Relationship detection
- [ ] Integration with existing RECON pipeline
- [ ] Optional MCP enrichment layer




