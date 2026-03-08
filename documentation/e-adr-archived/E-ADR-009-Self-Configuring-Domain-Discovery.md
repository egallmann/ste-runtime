# E-ADR-009: Self-Configuring Domain Discovery

**Status:** Proposed  
**Implementation:**  Complete  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Priority:** P0 - Critical for Adoption  
**Supersedes:** None  
**Related:** E-ADR-001 (RECON), E-ADR-006 (Angular Extraction)

> **Next Step:** Validate discovery heuristics against ste-spec portability requirements for ADR graduation.

---

## Context and Problem Statement

The ste-runtime is designed to be a portable, reusable framework for semantic extraction that can be dropped into any project. However, requiring users to manually configure domain names and paths creates a significant adoption barrier.

**The Challenge:** Different projects use different naming conventions:
- Some use `frontend` and `backend`
- Others use `client` and `server`
- Some use `web` and `api`
- Others have `app`, `ui`, `services`, etc.

**Current Limitation:** The runtime would require manual configuration to understand these different structures, creating friction at every installation.

**Desired State:** A self-configuring runtime that automatically understands any project structure, requiring zero configuration from users.

---

## Decision Drivers

### Primary Driver: Zero-Configuration Adoption

Manual configuration creates multiple friction points:
- Users must learn configuration schema
- Every project requires setup time
- Mistakes in configuration cause failures
- Reduces "just works" experience

**Goal:** Enable users to drop ste-runtime into any project and run immediately with zero setup.

### Secondary Driver: Universal Compatibility

Projects vary widely in structure:
- Monorepos with multiple packages
- Single-page applications
- Full-stack applications
- Microservices architectures
- Various naming conventions

**Goal:** Work with any project structure automatically, without requiring users to understand or describe their architecture.

### Constraint: Framework Independence

The runtime should discover and adapt to:
- Any frontend framework (Angular, React, Vue, Svelte, etc.)
- Any backend framework (Express, FastAPI, Lambda, Flask, etc.)
- Any infrastructure tooling (CloudFormation, Terraform, Kubernetes, etc.)

---

## Considered Options

### Option 1: Manual Configuration 

**Approach:** Require users to configure domains explicitly.

```json
{
  "domains": {
    "client": {
      "type": "client",
      "paths": ["src/client"],
      "framework": "react"
    },
    "server": {
      "type": "server",
      "paths": ["src/server"],
      "framework": "express"
    }
  }
}
```

**Pros:**
- Explicit control for power users
- Clear documentation of project structure
- Faster to implement (2 weeks)

**Cons:**
-  High adoption barrier (requires learning configuration)
-  Setup required for every project
-  Users must understand domain concepts before use
-  Configuration errors cause failures
-  Maintenance burden as projects evolve

**Adoption Impact:** Every new user must spend 10-30 minutes configuring before first use.

---

### Option 2: Self-Configuring Domain Discovery  CHOSEN

**Approach:** Automatically discover project structure on startup, adapt to whatever naming conventions the project uses.

```typescript
// No configuration required
// Runtime automatically discovers:
// - Project A: uses "frontend" + "backend"
// - Project B: uses "client" + "server"  
// - Project C: uses "web" + "api"
```

**Pros:**
-  Zero configuration required - drop in and run
-  Universal compatibility (works with any structure)
-  Better adoption UX ("just works")
-  Intelligent behavior (understands project context)
-  Framework-agnostic (detects any framework)
-  Self-documenting (discovery output shows what was found)

**Cons:**
- Longer implementation time (4 weeks vs 2 weeks)
- More complex implementation
- Discovery heuristics require careful design

**Adoption Impact:** Users can run `recon` immediately after installation - zero setup time.

---

## Decision Outcome

**Chosen Option:** **Option 2 - Self-Configuring Domain Discovery**

### Rationale

Despite the longer implementation timeline, self-configuration transforms the adoption experience:

1. **Eliminates Adoption Barrier**
   - Download and run immediately
   - No learning curve
   - No configuration errors
   - "Just works" with any project

2. **Universal Compatibility**
   - Works with any naming convention
   - Adapts to any framework
   - Handles any project structure
   - Scales to monorepos, microservices, etc.

3. **Better User Experience**
   - Immediate value delivery
   - No manual setup overhead
   - Self-documenting behavior
   - Reduces support burden

4. **Future-Proof Architecture**
   - Adapts to new frameworks automatically
   - No breaking changes as projects evolve
   - Enables ecosystem growth

### Key Insight

> "ste-runtime should orient itself to the project it was added to. It should understand the project structure and ensure that it can execute without humans configuring the ste-runtime. This is big for adoption and we must solve for this."

The investment in self-configuration pays dividends in adoption velocity and user satisfaction.

---

## Technical Design

### Phase 0: Project Structure Discovery

Add automatic discovery phase before extraction:

```typescript
interface DiscoveredDomain {
  name: string;              // Discovered from project directories
  type: DomainType;          // CLIENT | SERVER | INFRASTRUCTURE | DATA
  rootPaths: string[];       // Where domain files are located
  indicators: string[];      // What led to identification
  confidence: number;        // 0-1, how confident discovery is
  framework?: string;        // Detected framework (e.g., "angular", "react")
}

interface ProjectStructure {
  rootDir: string;
  domains: DiscoveredDomain[];
  architecture: 'monorepo' | 'multi-repo' | 'single';
}
```

### Discovery Heuristics

**CLIENT Domain Detection:**
- Directory names: `frontend`, `client`, `web`, `ui`, `app`, `src/app`, `www`
- File patterns: `*.component.ts`, `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`
- Framework indicators: `angular.json`, `package.json` with React/Vue/Angular
- UI patterns: Presence of `components/`, `views/`, `pages/` directories
- Style files: CSS, SCSS, styled-components

**SERVER Domain Detection:**
- Directory names: `backend`, `server`, `api`, `services`, `src/server`, `lambda`
- File patterns: `*.handler.py`, `*.controller.ts`, `*.route.js`, `*.service.ts`
- Framework indicators: Express, FastAPI, Lambda, Flask, NestJS
- API patterns: Presence of `routes/`, `handlers/`, `controllers/`, `endpoints/`

**INFRASTRUCTURE Domain Detection:**
- Directory names: `infrastructure`, `iac`, `terraform`, `cloudformation`, `k8s`, `helm`
- File patterns: `*.yaml` (CloudFormation), `*.tf`, `*.tfvars`, `*.k8s.yaml`
- IaC indicators: Terraform modules, CloudFormation templates, Kubernetes manifests

**DATA Domain Detection:**
- Directory names: `data`, `models`, `schemas`, `entities`, `database`
- File patterns: JSON schemas, database migrations, seed data
- ORM indicators: Sequelize models, SQLAlchemy models, Prisma schemas

### Discovery Algorithm

```typescript
async function discoverProjectStructure(rootDir: string): Promise<ProjectStructure> {
  // 1. Scan directory structure
  const fileTree = await scanFileSystem(rootDir);
  
  // 2. Analyze directories for naming patterns
  const directorySignals = analyzeDirectories(fileTree);
  
  // 3. Analyze file types and patterns
  const fileSignals = analyzeFilePatterns(fileTree);
  
  // 4. Detect frameworks from config files
  const frameworkSignals = await detectFrameworks(rootDir);
  
  // 5. Combine signals with confidence scoring
  const domains = identifyDomains({
    directorySignals,
    fileSignals,
    frameworkSignals
  });
  
  // 6. Determine architecture type
  const architecture = inferArchitecture(domains);
  
  return { rootDir, domains, architecture };
}
```

### Confidence Scoring

Each discovery signal contributes to confidence:

```typescript
function calculateDomainConfidence(signals: Signal[]): number {
  let score = 0;
  
  // Directory name match: 30%
  if (hasRecognizedDirectoryName(signals)) score += 0.3;
  
  // File patterns match: 30%
  if (hasRecognizedFilePatterns(signals)) score += 0.3;
  
  // Framework detected: 40%
  if (hasFrameworkIndicators(signals)) score += 0.4;
  
  return Math.min(score, 1.0);
}
```

### Integration with Extraction

#### Normalization Phase

Replace static domain assignment with discovered domains:

```typescript
// Dynamically assign domain based on file location
domain: projectDiscovery.getDomainForFile(assertion.source.file) || 'unknown',
```

#### Inference Phase

Use domain types instead of specific names:

```typescript
const domainType = projectDiscovery.getDomainType(slice.domain);
if (slice.type === 'component' && domainType === DomainType.CLIENT) {
  const framework = projectDiscovery.getFramework(slice.domain);
  tags.push(`${slice.domain}:${framework}`);
}
```

---

## Implementation Examples

### Example 1: Angular + Python Monorepo

Project structure:
```
my-app/
  frontend/src/
    app/components/
  backend/lambda/
    handlers/
```

Discovery result:
```typescript
{
  domains: [
    {
      name: "frontend",
      type: "CLIENT",
      framework: "angular",
      confidence: 0.95
    },
    {
      name: "backend",
      type: "SERVER",
      framework: "aws-lambda",
      confidence: 0.90
    }
  ]
}
```

### Example 2: React + Express

Project structure:
```
my-app/
  src/
    client/
    server/
```

Discovery result:
```typescript
{
  domains: [
    {
      name: "client",
      type: "CLIENT",
      framework: "react",
      confidence: 0.90
    },
    {
      name: "server",
      type: "SERVER",
      framework: "express",
      confidence: 0.90
    }
  ]
}
```

### Example 3: Next.js (Hybrid)

Project structure:
```
my-app/
  pages/
  pages/api/
```

Discovery result:
```typescript
{
  domains: [
    {
      name: "pages",
      type: "CLIENT",
      framework: "next",
      confidence: 0.95
    },
    {
      name: "api",
      type: "SERVER",
      framework: "next",
      confidence: 0.95
    }
  ]
}
```

---

## Consequences

### Positive Consequences

1. **Zero-Configuration Experience**
   - Drop into any project and run immediately
   - No setup time, no learning curve
   - Immediate value delivery

2. **Universal Compatibility**
   - Works with any project structure
   - Works with any naming convention
   - Works with any framework combination

3. **Intelligent Behavior**
   - Understands project context automatically
   - Tags and relationships use actual project names
   - Output reflects real architecture

4. **Better Adoption**
   - Reduces barrier to entry dramatically
   - Eliminates configuration errors
   - Enables rapid experimentation

5. **Self-Documenting**
   - Discovery output shows what was found
   - Users understand what runtime sees
   - Transparent behavior

### Negative Consequences

1. **Implementation Complexity**
   - Discovery engine requires careful design
   - Edge cases need handling
   - More code to maintain

2. **Longer Timeline**
   - 4 weeks vs 2 weeks for manual config
   - Delays other features
   - Higher upfront investment

3. **Discovery Accuracy**
   - Heuristics may fail for unusual structures
   - Need robust fallback mechanisms
   - Requires extensive testing

### Mitigation Strategies

**For Complexity:**
- Clear abstractions and interfaces
- Comprehensive unit test coverage
- Well-documented heuristics

**For Timeline:**
- Investment justified by adoption gains
- Phased implementation with validation gates
- Early user testing

**For Accuracy:**
- Confidence scoring system
- Graceful fallback to safe defaults
- Optional configuration override for edge cases
- Clear discovery debugging output

---

## Validation and Testing

### Success Criteria

- [ ] Discovery completes in <100ms for typical projects
- [ ] Works with 15+ different project structures without configuration
- [ ] Domain names in output match actual project naming
- [ ] Framework detection accuracy >90%
- [ ] Confidence scoring correctly identifies ambiguous cases
- [ ] Discovery output is clear and actionable

### Test Projects Matrix

| Project Type | Framework | Structure | Expected Domains |
|-------------|-----------|-----------|------------------|
| Create React App | React | Single | `src` (CLIENT) |
| Angular CLI | Angular | Single | `src/app` (CLIENT) |
| Express API | Express | Single | `src` (SERVER) |
| Next.js | Next.js | Hybrid | `pages` (CLIENT), `api` (SERVER) |
| Monorepo (Nx) | Multi | Complex | Multiple domains |
| Serverless | Lambda | Functions | `functions` (SERVER) |
| Full Stack | Multiple | Monorepo | CLIENT + SERVER + INFRA |
| Microservices | Multiple | Multi-repo | Per-service domains |

### Validation Process

1. **Unit Tests**: Test each discovery heuristic independently
2. **Integration Tests**: Test full discovery on sample projects
3. **Real-World Tests**: Test on actual open-source projects
4. **Performance Tests**: Ensure discovery is fast (<100ms)
5. **Accuracy Tests**: Verify confidence scoring is calibrated

---

## Implementation Timeline

| Week | Phase | Deliverables | Validation Gate |
|------|-------|--------------|-----------------|
| 1 | Discovery Engine | Structure scanning, domain identification, confidence scoring | Discovery works on 5+ project types |
| 2 | Integration | Normalization and inference use discovery | All existing tests passing |
| 3 | Testing | Validate with 15+ project types, edge cases | Universal compatibility demonstrated |
| 4 | Polish | Performance optimization, documentation, debugging tools | <100ms discovery, all metrics met |

**Key Milestones:**
- End of Week 1: Core discovery algorithm functional
- End of Week 2: Full integration complete
- End of Week 3: Edge cases handled, ready for release
- End of Week 4: Performance validated, documentation complete

---

## Risks and Contingencies

### Risk 1: Discovery Heuristics Insufficient
**Probability:** Medium  
**Impact:** High  
**Mitigation:**
- Implement confidence scoring to flag low-confidence cases
- Provide optional configuration override
- Include discovery debugging output
- Gather user feedback early

### Risk 2: Performance Concerns
**Probability:** Low  
**Impact:** Medium  
**Mitigation:**
- Cache discovery results for watch mode
- Optimize file scanning (ignore node_modules, etc.)
- Target: <100ms discovery time
- Profile and optimize hot paths

### Risk 3: Ambiguous Project Structures
**Probability:** Medium  
**Impact:** Medium  
**Mitigation:**
- Use confidence scoring to detect ambiguity
- Provide clear messaging when confidence is low
- Allow optional manual override
- Log discovery reasoning for debugging

### Risk 4: Timeline Overrun
**Probability:** Medium  
**Impact:** Medium  
**Mitigation:**
- Weekly validation gates with clear criteria
- Phased implementation
- Option to ship with fallback to manual config if needed

---

## Success Metrics

### Technical Metrics
- **Discovery Performance:** <100ms (target: <50ms)
- **Accuracy:** >90% correct domain identification
- **Coverage:** Works with 15+ project types
- **Performance:** No regression in extraction speed

### Adoption Metrics
- **Time to First RECON:** <2 minutes (vs 10+ with manual config)
- **Configuration Required:** 0% of projects
- **User Satisfaction:** Measured via feedback surveys

### Quality Metrics
- **Test Coverage:** >90% for discovery engine
- **False Positives:** <5% incorrect domain identification
- **User-Reported Issues:** Track and address rapidly

---

## References

### Related E-ADRs
- E-ADR-001: RECON Provisional Execution
- E-ADR-006: Angular Semantic Extraction
- E-ADR-007: Watchdog Authoritative Mode

### Related Concepts
- Convention over Configuration
- Zero-Configuration Tools (Vite, Create React App, Next.js)
- Automatic Code Discovery (Language servers, linters)

---

## Decision Record

**Date:** 2026-01-07  
**Status:** Proposed (pending implementation)  
**Priority:** P0 - Critical for adoption  

**Architectural Principle Established:**

> The ste-runtime shall be a self-configuring framework that automatically adapts to any project structure, requiring zero configuration from users while maintaining universal compatibility across frameworks and architectures.

**Design Philosophy:**

The best tools are invisible. By eliminating configuration requirements, we enable users to focus on extracting value rather than understanding setup. Self-configuration transforms ste-runtime from a tool that requires investment to a tool that delivers immediate results.

---

## Next Steps

1. **Stakeholder Review and Approval**
   - Review this E-ADR
   - Approve 4-week timeline
   - Confirm success criteria

2. **Week 1: Discovery Engine**
   - Implement `ProjectDiscovery` interface
   - Build structure scanning logic
   - Create domain identification heuristics
   - **Gate:** Works with 5+ diverse project types

3. **Week 2: Integration**
   - Refactor normalization to use discovery
   - Refactor inference to use discovery
   - **Gate:** All existing tests passing

4. **Week 3: Validation**
   - Test with 15+ project types
   - Handle edge cases and ambiguous structures
   - Optimize performance
   - **Gate:** Universal compatibility demonstrated

5. **Week 4: Release Preparation**
   - Final optimization and polish
   - Documentation and examples
   - Discovery debugging tools
   - Release ste-runtime v0.3.0
   - **Gate:** All success criteria met

---

**Status:**  **READY FOR REVIEW**  
**Next Action:** Obtain stakeholder approval to begin implementation  
**Expected Impact:** Dramatic improvement in adoption velocity and user experience
