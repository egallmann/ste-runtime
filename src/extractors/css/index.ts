/**
 * CSS/SCSS Semantic Extractor
 * 
 * Authority: E-ADR-006 (Angular and CSS/SCSS Semantic Extraction)
 * 
 * Standalone extractor for CSS/SCSS files. Extracts:
 * - Design tokens (CSS variables, SCSS variables, breakpoints, animations)
 * - Component styles (class names, media queries, state modifiers)
 * 
 * Cross-cutting pattern: Works with any frontend framework.
 */

export { extract, extractCssSemantics } from './css-extractor.js';
export type { 
  CssExtractionResult,
  ComponentStyles,
  DesignTokens,
} from './css-extractor.js';
