/**
 * Angular Semantic Extractor
 * 
 * Authority: E-ADR-006 (Angular and CSS/SCSS Semantic Extraction)
 * 
 * Extracts Angular-specific semantics:
 * - @Component decorators (selector, templateUrl, styleUrls, inputs, outputs)
 * - @Injectable decorators (providedIn, dependencies)
 * - Route definitions (paths, guards, lazy loading)
 * - HTML templates (child components, bindings, directives)
 * 
 * Delegates to CSS extractor for component styles.
 */

export { extractFromAngular, extract } from './angular-extractor.js';
export type { 
  AngularComponent,
  AngularService,
  AngularRoute,
  AngularTemplate,
} from './angular-extractor.js';


