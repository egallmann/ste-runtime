/**
 * CSS/SCSS Extractor
 * 
 * Authority: E-ADR-006 (Angular and CSS/SCSS Semantic Extraction)
 * 
 * Standalone extractor for CSS/SCSS files. Extracts:
 * - Design tokens (CSS variables, SCSS variables, breakpoints, animations)
 * - Component styles (class names, media queries, state modifiers)
 * 
 * This is a cross-cutting extractor that can be:
 * 1. Used independently for any frontend project (React, Vue, plain HTML)
 * 2. Delegated to by framework extractors (Angular, React, etc.)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveredFile, RawAssertion } from '../../recon/phases/index.js';
import { toPosixPath } from '../../utils/paths.js';

/**
 * CSS/SCSS extraction result
 */
export interface CssExtractionResult {
  type: 'styles' | 'design-tokens';
  data: ComponentStyles | DesignTokens;
}

/**
 * Component-level styles
 */
export interface ComponentStyles {
  classes: string[];           // .data-table, .header, etc.
  cssVariablesUsed: string[];  // var(--color-primary)
  scssVariablesUsed: string[]; // $color-primary
  mediaQueries: string[];      // @media (max-width: 768px)
  stateModifiers: string[];    // .button--disabled, .card:hover
  animations: string[];        // animation: fadeIn 0.3s
}

/**
 * Global design tokens
 */
export interface DesignTokens {
  cssVariables: Record<string, string>;    // --color-primary: #1a73e8
  scssVariables: Record<string, string>;   // $spacing-md: 16px
  breakpoints: Record<string, string>;     // $breakpoint-tablet: 768px
  animations: Record<string, string>;      // @keyframes fadeIn { ... }
}

/**
 * Determine if file contains design tokens or component styles
 */
function categorizeStyleFile(relativePath: string): 'design-tokens' | 'styles' {
  const posixPath = toPosixPath(relativePath);
  const basename = path.basename(posixPath);
  
  // Design token files (global styles)
  if (
    basename.includes('variables') ||
    basename.includes('tokens') ||
    basename.includes('theme') ||
    basename.includes('_variables') ||
    basename.includes('_tokens') ||
    posixPath.includes('/styles/') ||
    posixPath.includes('/theme/')
  ) {
    return 'design-tokens';
  }
  
  // Component styles (*.component.css, *.component.scss, specific component files)
  return 'styles';
}

/**
 * Extract CSS variables from content
 * Pattern: --variable-name: value;
 */
function extractCssVariables(content: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const [, name, value] = match;
    variables[`--${name}`] = value.trim();
  }
  
  return variables;
}

/**
 * Extract SCSS variables from content
 * Pattern: $variable-name: value;
 */
function extractScssVariables(content: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const regex = /\$([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const [, name, value] = match;
    variables[`$${name}`] = value.trim();
  }
  
  return variables;
}

/**
 * Extract breakpoints from SCSS variables
 * Pattern: $breakpoint-*: value;
 */
function extractBreakpoints(scssVariables: Record<string, string>): Record<string, string> {
  const breakpoints: Record<string, string> = {};
  
  for (const [name, value] of Object.entries(scssVariables)) {
    if (name.includes('breakpoint') || name.includes('screen')) {
      breakpoints[name] = value;
    }
  }
  
  return breakpoints;
}

/**
 * Extract keyframe animations
 * Pattern: @keyframes name { ... }
 */
function extractAnimations(content: string): Record<string, string> {
  const animations: Record<string, string> = {};
  const regex = /@keyframes\s+([\w-]+)\s*\{([^}]+)\}/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const [, name, body] = match;
    animations[name] = body.trim();
  }
  
  return animations;
}

/**
 * Extract CSS class names
 * Pattern: .class-name or &__element or &--modifier (BEM)
 */
function extractClasses(content: string): string[] {
  const classes = new Set<string>();
  
  // Standard class selectors: .class-name
  const standardRegex = /\.([a-zA-Z][\w-]*)/g;
  let match;
  while ((match = standardRegex.exec(content)) !== null) {
    classes.add(`.${match[1]}`);
  }
  
  // BEM element notation: &__element
  const bemElementRegex = /&__([\w-]+)/g;
  while ((match = bemElementRegex.exec(content)) !== null) {
    classes.add(`__${match[1]}`);
  }
  
  // BEM modifier notation: &--modifier
  const bemModifierRegex = /&--([\w-]+)/g;
  while ((match = bemModifierRegex.exec(content)) !== null) {
    classes.add(`--${match[1]}`);
  }
  
  return Array.from(classes);
}

/**
 * Extract CSS variables used in content
 * Pattern: var(--variable-name)
 */
function extractCssVariablesUsed(content: string): string[] {
  const variables = new Set<string>();
  const regex = /var\((--[\w-]+)\)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

/**
 * Extract SCSS variables used in content
 * Pattern: $variable-name (in property values)
 */
function extractScssVariablesUsed(content: string): string[] {
  const variables = new Set<string>();
  const regex = /:\s*(\$[\w-]+)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

/**
 * Extract media queries
 * Pattern: @media (condition) { ... }
 */
function extractMediaQueries(content: string): string[] {
  const queries = new Set<string>();
  const regex = /@media\s+([^{]+)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    queries.add(match[1].trim());
  }
  
  return Array.from(queries);
}

/**
 * Extract state modifiers (pseudo-classes and BEM modifiers)
 * Pattern: .class:hover, .class--disabled
 */
function extractStateModifiers(content: string): string[] {
  const modifiers = new Set<string>();
  
  // Pseudo-classes: :hover, :focus, :active, etc.
  const pseudoRegex = /:(hover|focus|active|disabled|checked|visited|valid|invalid|required)/g;
  let match;
  while ((match = pseudoRegex.exec(content)) !== null) {
    modifiers.add(`:${match[1]}`);
  }
  
  // BEM state modifiers: --loading, --error, --success
  const bemStateRegex = /--(loading|error|success|disabled|active|inactive|selected|expanded|collapsed)/g;
  while ((match = bemStateRegex.exec(content)) !== null) {
    modifiers.add(`--${match[1]}`);
  }
  
  return Array.from(modifiers);
}

/**
 * Extract animations used in content
 * Pattern: animation: name duration
 */
function extractAnimationsUsed(content: string): string[] {
  const animations = new Set<string>();
  const regex = /animation(?:-name)?:\s*([\w-]+)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    animations.add(match[1]);
  }
  
  return Array.from(animations);
}

/**
 * Extract design tokens from CSS/SCSS file
 */
function extractDesignTokens(content: string): DesignTokens {
  const cssVariables = extractCssVariables(content);
  const scssVariables = extractScssVariables(content);
  const breakpoints = extractBreakpoints(scssVariables);
  const animations = extractAnimations(content);
  
  return {
    cssVariables,
    scssVariables,
    breakpoints,
    animations,
  };
}

/**
 * Extract component styles from CSS/SCSS file
 */
function extractComponentStyles(content: string): ComponentStyles {
  const classes = extractClasses(content);
  const cssVariablesUsed = extractCssVariablesUsed(content);
  const scssVariablesUsed = extractScssVariablesUsed(content);
  const mediaQueries = extractMediaQueries(content);
  const stateModifiers = extractStateModifiers(content);
  const animations = extractAnimationsUsed(content);
  
  return {
    classes,
    cssVariablesUsed,
    scssVariablesUsed,
    mediaQueries,
    stateModifiers,
    animations,
  };
}

/**
 * Extract semantics from CSS/SCSS file
 */
export async function extractCssSemantics(
  file: DiscoveredFile,
  projectRoot: string
): Promise<CssExtractionResult> {
  const fullPath = path.resolve(projectRoot, file.path);
  const content = await fs.readFile(fullPath, 'utf-8');
  
  const category = categorizeStyleFile(file.path);
  
  if (category === 'design-tokens') {
    return {
      type: 'design-tokens',
      data: extractDesignTokens(content),
    };
  } else {
    return {
      type: 'styles',
      data: extractComponentStyles(content),
    };
  }
}

/**
 * Extract CSS/SCSS files
 * Entry point for RECON extraction phase
 */
export async function extract(
  files: DiscoveredFile[],
  projectRoot: string
): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  for (const file of files) {
    try {
      const result = await extractCssSemantics(file, projectRoot);
      const relativePath = toPosixPath(file.path);
      
      // Create assertion based on type
      if (result.type === 'design-tokens') {
        const tokens = result.data as DesignTokens;
        
        // Only create assertion if there are actual tokens
        if (
          Object.keys(tokens.cssVariables).length > 0 ||
          Object.keys(tokens.scssVariables).length > 0 ||
          Object.keys(tokens.breakpoints).length > 0 ||
          Object.keys(tokens.animations).length > 0
        ) {
          assertions.push({
            elementId: `design_tokens:${relativePath}`,
            elementType: 'design_tokens',
            file: relativePath,
            line: 1,
            language: 'css',
            metadata: {
              id: `design_tokens:${relativePath}`,
              name: path.basename(file.path),
              file: relativePath,
              cssVariables: tokens.cssVariables,
              scssVariables: tokens.scssVariables,
              breakpoints: tokens.breakpoints,
              animations: tokens.animations,
            },
          });
        }
      } else {
        const styles = result.data as ComponentStyles;
        
        // Only create assertion if there are actual styles
        if (
          styles.classes.length > 0 ||
          styles.cssVariablesUsed.length > 0 ||
          styles.scssVariablesUsed.length > 0
        ) {
          assertions.push({
            elementId: `styles:${relativePath}`,
            elementType: 'styles',
            file: relativePath,
            line: 1,
            language: 'css',
            metadata: {
              id: `styles:${relativePath}`,
              name: path.basename(file.path),
              file: relativePath,
              classes: styles.classes,
              cssVariablesUsed: styles.cssVariablesUsed,
              scssVariablesUsed: styles.scssVariablesUsed,
              mediaQueries: styles.mediaQueries,
              stateModifiers: styles.stateModifiers,
              animations: styles.animations,
            },
          });
        }
      }
    } catch (error) {
      console.warn(`[CSS Extractor] Failed to extract ${file.path}:`, error);
    }
  }
  
  return assertions;
}
