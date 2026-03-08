# E-ADR-006: Angular and CSS/SCSS Semantic Extraction

**Status:** Proposed  
**Implementation:**  Complete  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Next Step:** Validate Angular and CSS extraction patterns against ste-spec for ADR graduation.

**Related E-ADRs:**
- E-ADR-001: Content-addressable slice naming (discovered via Angular long filenames)

---

## Context

The TypeScript extractor currently processes Angular files as standard TypeScript, capturing:
- Functions and their signatures
- Classes and their methods
- Import/export relationships
- Module structure

However, Angular-specific semantics are not captured:

| Pattern | Current Extraction | Semantic Gap |
|---------|-------------------|--------------|
| `@Component({ selector: 'app-dashboard' })` | Class with decorator | Selector, templateUrl, styleUrls missing |
| `@Injectable({ providedIn: 'root' })` | Class with decorator | Dependency injection scope missing |
| Route definitions | Array of objects | Navigation structure, guards, lazy loading missing |
| HTML templates | Not extracted | Template bindings, component usage, directives missing |

Additionally, CSS/SCSS files contain semantic information valuable for **any** frontend project:
- Design tokens (CSS variables, SCSS variables)
- Responsive breakpoints
- Animation definitions
- Component styling patterns

**Impact**: Frontend components cannot be linked to:
- Their templates (component ↔ template relationship)
- Their styles (component ↔ styles relationship)
- Backend services they consume (HTTP calls → API endpoints)
- Other components they render (parent → child relationships)
- Routes that load them (route → component mapping)

The question arose: Should RECON extract Angular-specific semantics and CSS/SCSS beyond basic TypeScript?

---

## Decision

**RECON will extract Angular-specific semantics and CSS/SCSS as two separate but coordinated extractors.**

### Architecture: Decoupled Extractors

CSS/SCSS extraction is implemented as a **standalone extractor** that can be:
1. Used independently for any frontend project (React, Vue, plain HTML)
2. Delegated to by the Angular extractor for component styles

```
src/extractors/
├── angular/          # Angular-specific (decorators, routes, templates)
├── css/              # Standalone CSS/SCSS extractor (framework-agnostic)
└── ...
```

### Extraction Scope

**Angular Extractor** (`angular` language):

| Angular Pattern | Extract? | Domain | Type | Rationale |
|-----------------|----------|--------|------|-----------|
| `@Component` decorator |  Yes | `frontend` | `component` | Core UI building block |
| `@Injectable` decorator |  Yes | `frontend` | `service` | Backend integration point |
| Route definitions |  Yes | `frontend` | `route` | Navigation structure |
| HTML templates |  Yes | `frontend` | `template` | UI structure and bindings |
| `@Pipe` decorator |  Yes | `frontend` | `pipe` | Data transformation |
| `@Directive` decorator |  Yes | `frontend` | `directive` | DOM manipulation |
| `@NgModule` decorator |  Selective | `frontend` | `module` | Only standalone: false modules |

**CSS Extractor** (`css` language):

| CSS/SCSS Pattern | Extract? | Domain | Type | Rationale |
|------------------|----------|--------|------|-----------|
| Component styles |  Yes | `frontend` | `styles` | Class names, variables used |
| Global design tokens |  Yes | `frontend` | `design-tokens` | CSS variables, SCSS variables |
| Breakpoints |  Yes | `frontend` | `design-tokens` | Responsive system |
| Animations |  Yes | `frontend` | `design-tokens` | Reusable motion |

### Language Configuration

| Project Type | Languages Config | Result |
|--------------|------------------|--------|
| Angular | `["angular", "css"]` | Full Angular + CSS extraction |
| Angular (auto) | `["angular"]` | Angular delegates to CSS for styleUrls |
| React/Vue | `["typescript", "css"]` | TypeScript + standalone CSS |
| Plain HTML | `["css"]` | Just CSS extraction |
| Backend only | `["typescript", "python"]` | No CSS extraction |

---

## Rationale

### 1. Components Are the Primary UI Abstraction

Angular components encapsulate:
- Template (HTML structure)
- Styles (CSS/SCSS)
- Logic (TypeScript class)
- Metadata (selector, inputs, outputs)

Current extraction captures only the class. Enriched extraction captures the full component:

```typescript
@Component({
  selector: 'app-data-list',
  templateUrl: './data-list.component.html',
  styleUrls: ['./data-list.component.css']
})
export class DataListComponent {
  @Input() filters: FilterState;
  @Output() itemSelected = new EventEmitter<DataItem>();
}
```

**Extracted semantics**:
- Selector: `app-data-list`
- Template binding: `./data-list.component.html`
- Inputs: `filters` (type: FilterState)
- Outputs: `itemSelected` (type: EventEmitter<DataItem>)

### 2. Services Bridge Frontend to Backend

Injectable services typically make HTTP calls to backend APIs:

```typescript
@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private http: HttpClient) {}

  getData(): Observable<Data[]> {
    return this.http.get<Data[]>('/api/data');
  }
}
```

Extracting services enables:
- Linking service methods to API endpoints
- Tracing data flow from UI to backend
- Blast radius analysis: "If API changes, which components are affected?"

### 3. Routes Define Navigation Structure

Route definitions map URLs to components:

```typescript
export const routes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: 'users', component: UserListComponent, canActivate: [AuthGuard] },
  { path: 'reports', loadChildren: () => import('./reports/reports.module') }
];
```

Extracting routes enables:
- Understanding application navigation
- Identifying protected routes (guards)
- Lazy-loaded module relationships

### 4. Templates Reveal Component Composition

HTML templates show:
- Which child components are used
- Data bindings and event handlers
- Structural directives (ngIf, ngFor)

```html
<app-filter-bar [(filters)]="currentFilters"></app-filter-bar>
<app-data-table 
  [items]="items$ | async" 
  (rowClick)="onItemSelected($event)">
</app-data-table>
```

Extracting templates enables:
- Component composition graph (parent → child)
- Input/output binding verification
- Template-driven navigation

### 5. Styles Provide Design System Context

CSS/SCSS files contain semantic information essential for consistent UI changes:

**Design Tokens (CSS Variables)**
```scss
:root {
  --color-primary: #1a73e8;
  --color-error: #d32f2f;
  --spacing-md: 16px;
  --border-radius-lg: 8px;
}
```

An AI modifying a component must know these tokens exist to maintain design consistency.

**Component Styling Patterns**
```scss
.data-table {
  &__header { ... }      // BEM naming = semantic structure
  &--loading { ... }     // State modifier = behavior hint
  &--error { ... }       // Error state styling exists
}
```

Understanding class naming patterns enables:
- Following established conventions when adding styles
- Knowing which states are already styled
- Avoiding duplication of existing patterns

**Responsive Breakpoints**
```scss
$breakpoint-tablet: 768px;
$breakpoint-mobile: 480px;

@media (max-width: $breakpoint-tablet) { ... }
```

Extracting breakpoints enables:
- Consistent responsive behavior across components
- Understanding the responsive design system
- Proper mobile-first or desktop-first patterns

**Animation Definitions**
```scss
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(20px); } to { transform: translateY(0); } }
```

Existing animations should be reused, not recreated.

---

## Specification

### §6.1 Angular Discovery

Angular files are identified by:

1. **Components**: TypeScript files with `@Component` decorator
2. **Services**: TypeScript files with `@Injectable` decorator
3. **Routes**: TypeScript files exporting `Routes` array
4. **Templates**: HTML files in same directory as component files
5. **Styles**: CSS/SCSS files referenced by components or containing design tokens

Discovery patterns:

```typescript
const ANGULAR_PATTERNS = {
  components: '**/*.component.ts',
  services: '**/*.service.ts',
  guards: '**/*.guard.ts',
  pipes: '**/*.pipe.ts',
  directives: '**/*.directive.ts',
  routes: ['**/app.routes.ts', '**/*-routing.module.ts', '**/routes.ts'],
  templates: '**/*.component.html',
  styles: ['**/*.component.css', '**/*.component.scss', '**/styles.scss', '**/variables.scss'],
};
```

### §6.2 Component Extraction

**Input:**

```typescript
@Component({
  selector: 'app-user-panel',
  templateUrl: './user-panel.component.html',
  styleUrls: ['./user-panel.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, UserTableComponent]
})
export class UserPanelComponent implements OnInit {
  @Input() title: string = 'User Panel';
  @Output() refresh = new EventEmitter<void>();
  
  users$: Observable<User[]>;
  
  constructor(private dataService: DataService) {}
}
```

**Extracted Slice:**

```yaml
_slice:
  id: component:frontend/src/app/features/user-panel/user-panel.component.ts:UserPanelComponent
  domain: frontend
  type: component
  source_files:
    - frontend/src/app/features/user-panel/user-panel.component.ts
    - frontend/src/app/features/user-panel/user-panel.component.html
  references:
    - domain: frontend
      type: service
      id: service:frontend/src/app/core/services/data.service.ts:DataService
    - domain: frontend
      type: component
      id: component:frontend/src/app/shared/user-table.component.ts:UserTableComponent
  tags:
    - layer:frontend
    - angular:component
    - standalone:true

element:
  id: component:UserPanelComponent
  name: UserPanelComponent
  selector: app-user-panel
  templateUrl: ./user-panel.component.html
  styleUrls:
    - ./user-panel.component.css
  standalone: true
  imports:
    - CommonModule
    - RouterModule
    - UserTableComponent
  inputs:
    - name: title
      type: string
      default: User Panel
  outputs:
    - name: refresh
      type: EventEmitter<void>
  injectedServices:
    - DataService
```

### §6.3 Service Extraction

**Input:**

```typescript
@Injectable({ providedIn: 'root' })
export class DataService {
  private apiUrl = '/api/data';
  
  constructor(private http: HttpClient) {}
  
  getData(filters?: FilterState): Observable<Data[]> {
    return this.http.get<Data[]>(this.apiUrl, { params: filters });
  }
  
  updateData(id: string, data: Partial<Data>): Observable<Data> {
    return this.http.put<Data>(`${this.apiUrl}/${id}`, data);
  }
}
```

**Extracted Slice:**

```yaml
_slice:
  id: service:frontend/src/app/core/services/data.service.ts:DataService
  domain: frontend
  type: service
  source_files:
    - frontend/src/app/core/services/data.service.ts
  references:
    - domain: api
      type: endpoint
      id: endpoint:/api/data:GET
    - domain: api
      type: endpoint
      id: endpoint:/api/data/{id}:PUT
  tags:
    - layer:frontend
    - angular:injectable
    - scope:root
    - http:client

element:
  id: service:DataService
  name: DataService
  providedIn: root
  httpCalls:
    - method: GET
      urlPattern: /api/data
      functionName: getData
    - method: PUT
      urlPattern: /api/data/{id}
      functionName: updateData
  injectedDependencies:
    - HttpClient
```

### §6.4 Route Extraction

**Input:**

```typescript
export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { 
    path: 'items', 
    component: DataListComponent,
    canActivate: [AuthGuard],
    children: [
      { path: ':id', component: FindingDetailComponent }
    ]
  },
  { 
    path: 'reports', 
    loadChildren: () => import('./reports/reports.routes').then(m => m.routes)
  }
];
```

**Extracted Slice:**

```yaml
_slice:
  id: routes:frontend/src/app/app.routes.ts:main
  domain: frontend
  type: routes
  source_files:
    - frontend/src/app/app.routes.ts
  references:
    - domain: frontend
      type: component
      id: component:UserPanelComponent
    - domain: frontend
      type: component
      id: component:DataListComponent
    - domain: frontend
      type: guard
      id: guard:AuthGuard
  tags:
    - layer:frontend
    - angular:routing
    - has:lazy-loading
    - has:guards

element:
  id: routes:app.routes
  routes:
    - path: ""
      redirectTo: dashboard
    - path: dashboard
      component: HomeComponent
    - path: items
      component: DataListComponent
      guards:
        - AuthGuard
      children:
        - path: ":id"
          component: FindingDetailComponent
    - path: reports
      lazyLoad: ./reports/reports.routes
```

### §6.5 Template Extraction

**Input:** `user-panel.component.html`

```html
<div class="dashboard-container">
  <app-summary-cards [data]="summaryData$ | async"></app-summary-cards>
  
  <div class="charts-row">
    <app-data-chart 
      [items]="items$ | async"
      (chartClick)="onChartClick($event)">
    </app-data-chart>
  </div>
  
  <app-data-table 
    *ngIf="showTable"
    [items]="items$ | async"
    [filters]="currentFilters"
    (rowSelect)="navigateToItem($event)">
  </app-data-table>
</div>
```

**Extracted Slice:**

```yaml
_slice:
  id: template:frontend/src/app/features/user-panel/user-panel.component.html
  domain: frontend
  type: template
  source_files:
    - frontend/src/app/features/user-panel/user-panel.component.html
  references:
    - domain: frontend
      type: component
      id: component:SummaryCardsComponent
    - domain: frontend
      type: component
      id: component:DataChartComponent
    - domain: frontend
      type: component
      id: component:DataTableComponent
  referenced_by:
    - domain: frontend
      type: component
      id: component:UserPanelComponent
  tags:
    - layer:frontend
    - angular:template

element:
  id: template:user-panel.component.html
  parentComponent: UserPanelComponent
  childComponents:
    - selector: app-summary-cards
      inputs: [data]
    - selector: app-data-chart
      inputs: [items]
      outputs: [chartClick]
    - selector: app-data-table
      inputs: [items, filters]
      outputs: [rowSelect]
      conditionals: [ngIf]
  directives:
    - ngIf
  pipes:
    - async
```

### §6.6 Styles Extraction

**Input:** `user-panel.component.scss`

```scss
@import '../../styles/variables';

.dashboard-container {
  display: grid;
  gap: var(--spacing-lg);
  padding: var(--spacing-md);
  
  &--loading {
    opacity: 0.5;
    pointer-events: none;
  }
}

.charts-row {
  display: flex;
  gap: var(--spacing-md);
  
  @media (max-width: $breakpoint-tablet) {
    flex-direction: column;
  }
}
```

**Input:** `_variables.scss` (global design tokens)

```scss
// Design Tokens
:root {
  --color-primary: #1a73e8;
  --color-primary-dark: #1557b0;
  --color-error: #d32f2f;
  --color-success: #2e7d32;
  --color-warning: #f57c00;
  
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
}

// Breakpoints
$breakpoint-mobile: 480px;
$breakpoint-tablet: 768px;
$breakpoint-desktop: 1024px;
$breakpoint-wide: 1440px;

// Animations
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

**Extracted Slice (Component Styles):**

```yaml
_slice:
  id: styles:frontend/src/app/features/user-panel/user-panel.component.scss
  domain: frontend
  type: styles
  source_files:
    - frontend/src/app/features/user-panel/user-panel.component.scss
  references:
    - domain: frontend
      type: styles
      id: styles:frontend/src/styles/_variables.scss
  referenced_by:
    - domain: frontend
      type: component
      id: component:UserPanelComponent
  tags:
    - layer:frontend
    - angular:styles
    - has:responsive

element:
  id: styles:user-panel.component.scss
  parentComponent: UserPanelComponent
  imports:
    - ../../styles/variables
  classNames:
    - .dashboard-container
    - .dashboard-container--loading
    - .charts-row
  cssVariablesUsed:
    - --spacing-lg
    - --spacing-md
  scssVariablesUsed:
    - $breakpoint-tablet
  stateModifiers:
    - --loading
  mediaQueries:
    - type: max-width
      breakpoint: $breakpoint-tablet
```

**Extracted Slice (Global Design Tokens):**

```yaml
_slice:
  id: styles:frontend/src/styles/_variables.scss
  domain: frontend
  type: design-tokens
  source_files:
    - frontend/src/styles/_variables.scss
  tags:
    - layer:frontend
    - design:tokens
    - scope:global

element:
  id: design-tokens:_variables.scss
  cssVariables:
    colors:
      --color-primary: "#1a73e8"
      --color-primary-dark: "#1557b0"
      --color-error: "#d32f2f"
      --color-success: "#2e7d32"
      --color-warning: "#f57c00"
    spacing:
      --spacing-xs: "4px"
      --spacing-sm: "8px"
      --spacing-md: "16px"
      --spacing-lg: "24px"
      --spacing-xl: "32px"
    borders:
      --border-radius-sm: "4px"
      --border-radius-md: "8px"
      --border-radius-lg: "12px"
  scssVariables:
    breakpoints:
      $breakpoint-mobile: "480px"
      $breakpoint-tablet: "768px"
      $breakpoint-desktop: "1024px"
      $breakpoint-wide: "1440px"
  animations:
    - fadeIn
    - slideUp
```

### §6.7 Inference: Frontend to Backend Linking

During inference phase, link frontend services to backend APIs:

1. Extract HTTP call patterns from services (url, method)
2. Match against extracted API endpoints
3. Create bidirectional references:
   - Service → "calls" → API Endpoint
   - API Endpoint → "called_by" → Service

```
Frontend Service (DataService)
    │
    ├─── GET /api/data ──────────> Lambda (get_data)
    │                                      │
    └─── PUT /api/data/{id} ─────> Lambda (update_data)
```

---

## Implementation

### Files to Create

**Angular Extractor** (`src/extractors/angular/`):

| File | Purpose |
|------|---------|
| `src/extractors/angular/index.ts` | Module exports |
| `src/extractors/angular/angular-extractor.ts` | Main extraction coordinator |
| `src/extractors/angular/component-extractor.ts` | @Component decorator extraction |
| `src/extractors/angular/service-extractor.ts` | @Injectable decorator extraction |
| `src/extractors/angular/route-extractor.ts` | Routes array extraction |
| `src/extractors/angular/template-extractor.ts` | HTML template extraction |

**CSS Extractor** (`src/extractors/css/`) - Standalone, framework-agnostic:

| File | Purpose |
|------|---------|
| `src/extractors/css/index.ts` | Module exports |
| `src/extractors/css/css-extractor.ts` | Main CSS/SCSS extraction coordinator |
| `src/extractors/css/styles-extractor.ts` | Component styles extraction |
| `src/extractors/css/design-tokens-extractor.ts` | CSS variables, SCSS variables, animations |

### Delegation Pattern

Angular extractor delegates to CSS extractor for component styles:

```typescript
// In angular/component-extractor.ts
import { extractStyles } from '../css/css-extractor.js';

async function extractComponent(file: DiscoveredFile): Promise<RawAssertion[]> {
  const component = parseComponentDecorator(file);
  
  // Delegate style extraction to CSS extractor
  if (component.styleUrls) {
    const styleAssertions = await extractStyles(component.styleUrls, {
      parentComponent: component.className,
      parentFile: file.relativePath,
    });
    assertions.push(...styleAssertions);
  }
  
  return assertions;
}
```

### Files to Modify

| File | Change |
|------|--------|
| `src/config/index.ts` | Add `angular` and `css` to SupportedLanguage |
| `src/recon/phases/discovery.ts` | Add Angular and CSS file patterns |
| `src/recon/phases/extraction.ts` | Route Angular/CSS files to extractors |
| `src/recon/phases/normalization.ts` | Normalize to frontend domain |
| `src/recon/phases/inference.ts` | Link services to APIs, components to templates/styles |

### Configuration

**Angular project:**

```json
{
  "languages": ["typescript", "python", "cloudformation", "json", "angular"],
  "angularPatterns": {
    "components": "**/src/app/**/*.component.ts",
    "services": "**/src/app/**/*.service.ts",
    "templates": "**/src/app/**/*.component.html"
  },
  "cssPatterns": {
    "styles": "**/src/app/**/*.component.{css,scss}",
    "designTokens": "**/src/styles/**/*.scss"
  }
}
```

**React/Vue project (CSS only, no Angular):**

```json
{
  "languages": ["typescript", "css"],
  "cssPatterns": {
    "styles": "**/src/**/*.{css,scss,module.css}",
    "designTokens": "**/src/styles/**/*.{css,scss}"
  }
}
```

**Any project with just design tokens:**

```json
{
  "languages": ["css"],
  "cssPatterns": {
    "designTokens": "**/styles/**/*.{css,scss}"
  }
}
```

---

## Architectural Principle: Cross-Cutting Extractor Decoupling

CSS/SCSS extraction demonstrates a broader architectural principle: **extractors for cross-cutting concerns should be standalone modules that can be delegated to by framework-specific extractors**.

### The Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cross-Cutting Extractors                      │
│  (Standalone, framework-agnostic, can be used independently)    │
├─────────────────────────────────────────────────────────────────┤
│  CSS/SCSS  │  GraphQL  │  OpenAPI  │  Env Vars  │  Markdown    │
└──────┬─────┴─────┬─────┴─────┬─────┴──────┬─────┴───────┬──────┘
       │           │           │            │             │
       ▼           ▼           ▼            ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Framework Extractors                           │
│  (Delegate to cross-cutting extractors as needed)               │
├─────────────────────────────────────────────────────────────────┤
│  Angular   │   React   │   Vue   │   Python   │  CloudFormation │
└─────────────────────────────────────────────────────────────────┘
```

### Known Cross-Cutting Concerns

When implementing future extractors, consider whether they should be standalone:

| Concern | Cross-Cutting? | Used By | Standalone Extractor? |
|---------|----------------|---------|----------------------|
| **CSS/SCSS** |  Yes | Angular, React, Vue, HTML | `src/extractors/css/` |
| **GraphQL** |  Yes | Angular, React, Vue, Node | Future: `src/extractors/graphql/` |
| **OpenAPI/Swagger** |  Yes | Any frontend, any backend | Future: `src/extractors/openapi/` |
| **Environment Variables** |  Yes | All languages, all frameworks | Future: `src/extractors/env/` |
| **Markdown/ADRs** |  Yes | All projects | Future: `src/extractors/markdown/` |
| **SQL Migrations** |  Yes | Python, TypeScript, Java | Future: `src/extractors/sql/` |
| **Protocol Buffers** |  Yes | Multi-language services | Future: `src/extractors/protobuf/` |
| **YAML Config** |  Partial | Docker, K8s, GitHub Actions | Future: `src/extractors/yaml/` |
| **JSON Schema** |  Partial | Validation, API contracts | Covered by E-ADR-005 |

### Implementation Guidance

When building a new extractor, ask:

1. **Is this concern framework-specific?**
   - Yes → Build inside framework extractor (e.g., `@Component` is Angular-only)
   - No → Build as standalone extractor

2. **Can multiple frameworks use this?**
   - Yes → Standalone extractor with delegation pattern
   - No → Framework-specific extractor

3. **Does it have value without the framework?**
   - Yes → Must be independently invocable via language config
   - No → Can be internal to framework extractor

### Delegation Example

```typescript
// Framework extractor delegates to cross-cutting extractor
import { extractGraphQL } from '../graphql/graphql-extractor.js';

// In React component extraction
if (usesApolloClient(file)) {
  const graphqlAssertions = await extractGraphQL(file.graphqlQueries);
  assertions.push(...graphqlAssertions);
}

// In Angular service extraction  
if (usesApolloAngular(file)) {
  const graphqlAssertions = await extractGraphQL(file.graphqlQueries);
  assertions.push(...graphqlAssertions);
}
```

This ensures:
- GraphQL extraction works for React, Angular, Vue, or standalone
- Consistent slice format regardless of which framework uses it
- No duplication of extraction logic across framework extractors

---

## Constraints

1. **Decorator Parsing**: Angular decorators contain object literals. Must parse decorator arguments, not just detect decorator presence.

2. **Template Parsing**: HTML templates require lightweight parsing to extract component selectors and bindings. Full Angular template compilation is not required.

3. **Selector Resolution**: Component selectors (e.g., `app-data-table`) must be resolved to component classes across the codebase.

4. **HTTP URL Patterns**: Service HTTP calls may use string interpolation. Extract URL patterns with placeholders (e.g., `/api/data/{id}`).

5. **Lazy Loading**: Route lazy loading uses dynamic imports. Must parse import paths to resolve loaded modules.

6. **Standalone vs Module**: Angular supports both standalone components and NgModule-based components. Extraction must handle both patterns.

7. **CSS/SCSS Parsing**: Style extraction uses regex-based parsing for CSS variables, class names, and SCSS variables. Full CSS AST parsing is not required. Focus on semantic elements: design tokens, breakpoints, animations.

8. **Design Token Scope**: Global design tokens (in `styles/` directory) are extracted as `design-tokens` type. Component-scoped styles are extracted as `styles` type linked to their parent component.

---

## Consequences

### Positive

- Component → template relationships explicit in graph
- Component → styles relationships explicit in graph
- Service → API endpoint tracing enabled
- Route structure visible for navigation analysis
- Full-stack blast radius analysis possible
- Frontend layer queryable via RSS
- Design tokens (CSS variables) discoverable for consistent styling
- AI can use existing patterns instead of inventing new ones

### Negative

- Increased extraction complexity
- HTML parsing introduces new failure modes
- Selector resolution requires cross-file analysis
- Angular version differences may affect extraction

### Mitigation

- Graceful fallback to basic TypeScript extraction on failure
- Selector resolution uses best-effort matching
- Template parsing uses lightweight regex, not full Angular compiler
- Version-specific patterns configurable

---

## Relationship to Other Decisions

- **E-ADR-001 (RECON Provisional Execution)**: Angular extraction follows same provisional model
- **E-ADR-002 (RECON Self-Validation)**: Validation covers Angular extraction quality
- **E-ADR-004 (RSS CLI)**: Angular entities queryable via RSS
- **E-ADR-005 (JSON Extraction)**: JSON schemas may define API contracts consumed by services

---

## Acceptance Criteria

1. RECON extracts `@Component` decorators with selector, templateUrl, styleUrls, inputs, outputs
2. RECON extracts `@Injectable` decorators with providedIn scope and HTTP calls
3. RECON extracts route definitions with components, guards, and lazy loading
4. RECON extracts HTML templates with child component selectors and bindings
5. RECON extracts CSS/SCSS files with class names, CSS variables used, and media queries
6. RECON extracts global design tokens (CSS variables, SCSS variables, animations)
7. RSS `stats` shows `frontend` domain with component, service, route, template, styles, design-tokens types
8. RSS `dependencies component:UserPanelComponent` returns template, styles, services, child components
9. RSS `dependents service:DataService` returns components that inject it
10. RSS `search "--color-primary"` returns design-tokens slice containing the variable
11. Service HTTP calls linked to API endpoints (when endpoints exist in graph)
12. Component styles linked to design tokens they reference

---

## Review Trigger

This decision should be revisited when:

1. Angular major version changes decorator syntax
2. New Angular patterns emerge (signals, control flow)
3. Extraction accuracy falls below acceptable threshold
4. Performance impact is prohibitive

---

## References

- STE Architecture Specification, Section 4.5: RECON
- E-ADR-001: Provisional Execution of RECON (slice naming design decision)
- E-ADR-004: RSS CLI Implementation
- E-ADR-005: JSON Data Model Extraction
- E-ADR-008: Extractor Development Guide
- [Angular Component Documentation](https://angular.io/guide/component-overview)
- [Angular Dependency Injection](https://angular.io/guide/dependency-injection)

---

## Appendix: Discovery of Content-Addressable Naming

**Date:** 2026-01-07  
**Impact:** Critical design change

### Problem Discovered

During specification of Angular extraction, a failure mode was identified:

**Angular component slice filenames exceeded filesystem limits:**
```
component-frontend-src-app-features-reports-report-views-control-effectiveness-report-control-effectiveness-report.component.ts-ControlEffectivenessReportComponent.yaml
```
- Length: 180-250 characters
- Windows limit: 260 characters (path + filename)
- Unix limit: 255 characters (filename only)

### Resolution

**Switched to content-addressable hashing (see E-ADR-001 update):**
- Filenames are now 16-character SHA-256 hashes
- Example: `009bd442b992f055.yaml`
- Slice ID remains inside file as source of truth
- Performance improved: 766 slices/sec (up from 687)

### Rationale

1. **AI-DOC is machine-readable**, not human-edited
2. **Filesystem portability** across all platforms
3. **Performance** improvement with shorter paths
4. **Aligns with philosophy**: Slice ID is authoritative, not filename

This discovery validates the exploratory ADR approach: implementing E-ADR-006 surfaced a real failure mode that improved the overall system design.

