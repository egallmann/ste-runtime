/**
 * Angular Semantic Extractor
 * 
 * Authority: E-ADR-006 (Angular and CSS/SCSS Semantic Extraction)
 * 
 * Extracts Angular-specific semantics from TypeScript files:
 * - @Component decorators with metadata
 * - @Injectable decorators with DI scope
 * - Route definitions
 * - HTML templates
 * 
 * Delegates to CSS extractor for component styles.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';
import type { DiscoveredFile, RawAssertion } from '../../recon/phases/index.js';
import type { AngularPatterns } from '../../config/index.js';
import { toPosixPath } from '../../utils/paths.js';
import { extractCssSemantics } from '../css/css-extractor.js';

/**
 * Angular component metadata
 */
export interface AngularComponent {
  className: string;
  selector?: string;
  templateUrl?: string;
  template?: string;  // Inline template
  styleUrls?: string[];
  styles?: string[];  // Inline styles
  standalone?: boolean;
  imports?: string[];
  inputs?: Array<{ name: string; type?: string }>;
  outputs?: Array<{ name: string; type?: string }>;
  injectedServices?: string[];
}

/**
 * Angular service metadata
 */
export interface AngularService {
  className: string;
  providedIn?: string;
  httpCalls?: Array<{ method: string; urlPattern: string; functionName: string }>;
  injectedDependencies?: string[];
}

/**
 * Angular route definition
 */
export interface AngularRoute {
  path: string;
  component?: string;
  redirectTo?: string;
  guards?: string[];
  lazyLoad?: string;
  children?: AngularRoute[];
}

/**
 * Angular template metadata
 */
export interface AngularTemplate {
  parentComponent: string;
  childComponents: Array<{ selector: string; inputs?: string[]; outputs?: string[] }>;
  directives: string[];
  pipes: string[];
}

/**
 * Angular pipe metadata
 */
export interface AngularPipe {
  className: string;
  pipeName: string;
  standalone?: boolean;
}

/**
 * Angular directive metadata
 */
export interface AngularDirective {
  className: string;
  selector?: string;
  standalone?: boolean;
  inputs?: Array<{ name: string; type?: string }>;
  outputs?: Array<{ name: string; type?: string }>;
}

/**
 * Determine the Angular file type
 */
function getAngularFileType(relativePath: string): 'component' | 'service' | 'pipe' | 'directive' | 'guard' | 'routes' | 'template' | 'other' {
  const posixPath = toPosixPath(relativePath);
  
  if (posixPath.endsWith('.component.ts')) return 'component';
  if (posixPath.endsWith('.service.ts')) return 'service';
  if (posixPath.endsWith('.pipe.ts')) return 'pipe';
  if (posixPath.endsWith('.directive.ts')) return 'directive';
  if (posixPath.endsWith('.guard.ts')) return 'guard';
  if (posixPath.includes('routes') || posixPath.includes('routing')) return 'routes';
  if (posixPath.endsWith('.component.html')) return 'template';
  
  return 'other';
}

/**
 * Parse decorator arguments from TypeScript AST
 */
function parseDecoratorArgs(decorator: ts.Decorator): Record<string, unknown> | null {
  if (!ts.isCallExpression(decorator.expression)) {
    return null;
  }
  
  const args = decorator.expression.arguments;
  if (args.length === 0) {
    return {};
  }
  
  const firstArg = args[0];
  if (!ts.isObjectLiteralExpression(firstArg)) {
    return null;
  }
  
  const result: Record<string, unknown> = {};
  
  for (const prop of firstArg.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const key = prop.name.text;
      const value = parsePropertyValue(prop.initializer);
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Parse a property value from AST node
 */
function parsePropertyValue(node: ts.Node): unknown {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(parsePropertyValue).filter(v => v !== undefined);
  }
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.getText();
  }
  
  return undefined;
}

/**
 * Extract Angular 17+ signal-based inputs/outputs from class properties
 * Detects patterns like:
 *   - myInput = input<string>()
 *   - myRequiredInput = input.required<string>()
 *   - myOutput = output<EventType>()
 */
function extractSignalInputsOutputs(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): { inputs: Array<{ name: string; type?: string; required?: boolean }>; outputs: Array<{ name: string; type?: string }> } {
  const inputs: Array<{ name: string; type?: string; required?: boolean }> = [];
  const outputs: Array<{ name: string; type?: string }> = [];
  
  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (!ts.isIdentifier(member.name)) continue;
    if (!member.initializer) continue;
    
    const propName = member.name.text;
    // Check for input() or input.required() pattern
    if (ts.isCallExpression(member.initializer)) {
      const callExpr = member.initializer;
      const callText = callExpr.expression.getText(sourceFile);
      
      // input<T>() or input(defaultValue)
      if (callText === 'input') {
        const typeArg = callExpr.typeArguments?.[0]?.getText(sourceFile);
        inputs.push({
          name: propName,
          type: typeArg,
          required: false,
        });
      }
      // input.required<T>()
      else if (callText === 'input.required') {
        const typeArg = callExpr.typeArguments?.[0]?.getText(sourceFile);
        inputs.push({
          name: propName,
          type: typeArg,
          required: true,
        });
      }
      // output<T>()
      else if (callText === 'output') {
        const typeArg = callExpr.typeArguments?.[0]?.getText(sourceFile);
        outputs.push({
          name: propName,
          type: typeArg,
        });
      }
    }
  }
  
  return { inputs, outputs };
}

/**
 * Extract inject() function calls for dependency injection
 * Detects patterns like:
 *   - private http = inject(HttpClient)
 *   - readonly myService = inject(MyService)
 */
function extractInjectCalls(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): string[] {
  const injectedServices: string[] = [];
  
  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (!member.initializer) continue;
    
    // Check for inject(ServiceClass) pattern
    if (ts.isCallExpression(member.initializer)) {
      const callExpr = member.initializer;
      const callText = callExpr.expression.getText(sourceFile);
      
      if (callText === 'inject' && callExpr.arguments.length > 0) {
        const firstArg = callExpr.arguments[0];
        if (ts.isIdentifier(firstArg)) {
          injectedServices.push(firstArg.text);
        }
      }
    }
  }
  
  return injectedServices;
}

/**
 * Extract @Component decorator metadata
 */
function extractComponentDecorator(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): AngularComponent | null {
  const decorators = ts.getDecorators(node);
  if (!decorators) return null;
  
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    
    const decoratorName = decorator.expression.expression;
    if (!ts.isIdentifier(decoratorName) || decoratorName.text !== 'Component') continue;
    
    const args = parseDecoratorArgs(decorator);
    if (!args) continue;
    
    const className = node.name?.text ?? 'UnknownComponent';
    
    // Extract inputs and outputs from class properties (decorator-based)
    const inputs: Array<{ name: string; type?: string; required?: boolean }> = [];
    const outputs: Array<{ name: string; type?: string }> = [];
    const injectedServices: string[] = [];
    
    for (const member of node.members) {
      // Check for @Input() decorator
      if (ts.isPropertyDeclaration(member)) {
        const memberDecorators = ts.getDecorators(member);
        if (memberDecorators) {
          for (const dec of memberDecorators) {
            if (ts.isCallExpression(dec.expression) || ts.isIdentifier(dec.expression)) {
              const decName = ts.isCallExpression(dec.expression) 
                ? (dec.expression.expression as ts.Identifier).text 
                : dec.expression.text;
              
              if (decName === 'Input' && ts.isIdentifier(member.name)) {
                inputs.push({
                  name: member.name.text,
                  type: member.type?.getText(sourceFile),
                });
              }
              if (decName === 'Output' && ts.isIdentifier(member.name)) {
                outputs.push({
                  name: member.name.text,
                  type: member.type?.getText(sourceFile),
                });
              }
            }
          }
        }
      }
      
      // Extract constructor injections
      if (ts.isConstructorDeclaration(member)) {
        for (const param of member.parameters) {
          if (param.type && ts.isTypeReferenceNode(param.type)) {
            const typeName = param.type.typeName;
            if (ts.isIdentifier(typeName)) {
              injectedServices.push(typeName.text);
            }
          }
        }
      }
    }
    
    // Extract Angular 17+ signal-based inputs/outputs
    const signalIO = extractSignalInputsOutputs(node, sourceFile);
    inputs.push(...signalIO.inputs);
    outputs.push(...signalIO.outputs);
    
    // Extract inject() function calls for DI
    const injectCallServices = extractInjectCalls(node, sourceFile);
    injectedServices.push(...injectCallServices);
    
    return {
      className,
      selector: args.selector as string | undefined,
      templateUrl: args.templateUrl as string | undefined,
      template: args.template as string | undefined,
      styleUrls: args.styleUrls as string[] | undefined,
      styles: args.styles as string[] | undefined,
      standalone: args.standalone as boolean | undefined,
      imports: args.imports as string[] | undefined,
      inputs,
      outputs,
      injectedServices,
    };
  }
  
  return null;
}

/**
 * Extract HTTP call URL pattern from a call expression using AST
 * Handles patterns like:
 *   - this.http.get<T>('/api/users')
 *   - this.http.post(this.apiUrl, data)
 *   - this.http.get(`${this.baseUrl}/endpoint`)
 */
function extractHttpUrlFromCall(callExpr: ts.CallExpression, sourceFile: ts.SourceFile): string {
  // The first argument to http.get/post/etc is the URL
  const firstArg = callExpr.arguments[0];
  if (!firstArg) return 'unknown';
  
  // String literal: '/api/users'
  if (ts.isStringLiteral(firstArg)) {
    return firstArg.text;
  }
  
  // Template literal: `${this.baseUrl}/endpoint`
  if (ts.isTemplateExpression(firstArg)) {
    // Extract the template parts to build a pattern
    let pattern = firstArg.head.text;
    for (const span of firstArg.templateSpans) {
      // Replace expressions with placeholders
      const exprText = span.expression.getText(sourceFile);
      if (exprText.includes('this.')) {
        // Property reference like this.apiUrl
        pattern += `{${exprText.replace('this.', '')}}`;
      } else {
        // Variable or parameter
        pattern += `{${exprText}}`;
      }
      pattern += span.literal.text;
    }
    return pattern;
  }
  
  // No-substitution template literal: `/api/users`
  if (ts.isNoSubstitutionTemplateLiteral(firstArg)) {
    return firstArg.text;
  }
  
  // Property access or identifier: this.apiUrl or apiUrl
  if (ts.isPropertyAccessExpression(firstArg)) {
    const propName = firstArg.name.text;
    return `{${propName}}`;
  }
  
  if (ts.isIdentifier(firstArg)) {
    return `{${firstArg.text}}`;
  }
  
  return 'unknown';
}

/**
 * Extract HTTP calls from a method using AST traversal
 */
function extractHttpCallsFromMethod(
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): Array<{ method: string; urlPattern: string; functionName: string }> {
  const httpCalls: Array<{ method: string; urlPattern: string; functionName: string }> = [];
  const methodName = ts.isIdentifier(method.name) ? method.name.text : 'unknown';
  const httpMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);
  
  function visit(node: ts.Node) {
    // Look for call expressions like this.http.get(...)
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      
      // Pattern: this.http.get(...) or this.httpClient.post(...)
      if (ts.isPropertyAccessExpression(expr)) {
        const methodCall = expr.name.text.toLowerCase();
        
        if (httpMethods.has(methodCall)) {
          // Check if it's a call on 'http' or 'httpClient'
          const obj = expr.expression;
          if (ts.isPropertyAccessExpression(obj)) {
            const propName = obj.name.text.toLowerCase();
            if (propName === 'http' || propName === 'httpclient') {
              const urlPattern = extractHttpUrlFromCall(node, sourceFile);
              httpCalls.push({
                method: methodCall.toUpperCase(),
                urlPattern,
                functionName: methodName,
              });
            }
          }
        }
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  if (method.body) {
    visit(method.body);
  }
  
  return httpCalls;
}

/**
 * Extract @Injectable decorator metadata
 */
function extractInjectableDecorator(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): AngularService | null {
  const decorators = ts.getDecorators(node);
  if (!decorators) return null;
  
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    
    const decoratorName = decorator.expression.expression;
    if (!ts.isIdentifier(decoratorName) || decoratorName.text !== 'Injectable') continue;
    
    const args = parseDecoratorArgs(decorator);
    const className = node.name?.text ?? 'UnknownService';
    
    // Extract HTTP calls using AST traversal
    const httpCalls: Array<{ method: string; urlPattern: string; functionName: string }> = [];
    const injectedDependencies: string[] = [];
    
    for (const member of node.members) {
      // Extract constructor injections
      if (ts.isConstructorDeclaration(member)) {
        for (const param of member.parameters) {
          if (param.type && ts.isTypeReferenceNode(param.type)) {
            const typeName = param.type.typeName;
            if (ts.isIdentifier(typeName)) {
              injectedDependencies.push(typeName.text);
            }
          }
        }
      }
      
      // Extract HTTP calls from methods using AST
      if (ts.isMethodDeclaration(member)) {
        const methodHttpCalls = extractHttpCallsFromMethod(member, sourceFile);
        httpCalls.push(...methodHttpCalls);
      }
    }
    
    // Extract inject() function calls for DI (Angular 17+ pattern)
    const injectCallServices = extractInjectCalls(node, sourceFile);
    injectedDependencies.push(...injectCallServices);
    
    return {
      className,
      providedIn: args?.providedIn as string | undefined,
      httpCalls: httpCalls.length > 0 ? httpCalls : undefined,
      injectedDependencies: injectedDependencies.length > 0 ? injectedDependencies : undefined,
    };
  }
  
  return null;
}

/**
 * Extract @Pipe decorator metadata
 */
function extractPipeDecorator(
  node: ts.ClassDeclaration,
  _sourceFile: ts.SourceFile
): AngularPipe | null {
  const decorators = ts.getDecorators(node);
  if (!decorators) return null;
  
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    
    const decoratorName = decorator.expression.expression;
    if (!ts.isIdentifier(decoratorName) || decoratorName.text !== 'Pipe') continue;
    
    const args = parseDecoratorArgs(decorator);
    if (!args) continue;
    
    const className = node.name?.text ?? 'UnknownPipe';
    
    return {
      className,
      pipeName: args.name as string,
      standalone: args.standalone as boolean | undefined,
    };
  }
  
  return null;
}

/**
 * Extract @Directive decorator metadata
 */
function extractDirectiveDecorator(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): AngularDirective | null {
  const decorators = ts.getDecorators(node);
  if (!decorators) return null;
  
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    
    const decoratorName = decorator.expression.expression;
    if (!ts.isIdentifier(decoratorName) || decoratorName.text !== 'Directive') continue;
    
    const args = parseDecoratorArgs(decorator);
    if (!args) continue;
    
    const className = node.name?.text ?? 'UnknownDirective';
    
    // Extract inputs and outputs (decorator-based)
    const inputs: Array<{ name: string; type?: string }> = [];
    const outputs: Array<{ name: string; type?: string }> = [];
    
    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member)) {
        const memberDecorators = ts.getDecorators(member);
        if (memberDecorators) {
          for (const dec of memberDecorators) {
            if (ts.isCallExpression(dec.expression) || ts.isIdentifier(dec.expression)) {
              const decName = ts.isCallExpression(dec.expression) 
                ? (dec.expression.expression as ts.Identifier).text 
                : dec.expression.text;
              
              if (decName === 'Input' && ts.isIdentifier(member.name)) {
                inputs.push({
                  name: member.name.text,
                  type: member.type?.getText(sourceFile),
                });
              }
              if (decName === 'Output' && ts.isIdentifier(member.name)) {
                outputs.push({
                  name: member.name.text,
                  type: member.type?.getText(sourceFile),
                });
              }
            }
          }
        }
      }
    }
    
    // Extract Angular 17+ signal-based inputs/outputs
    const signalIO = extractSignalInputsOutputs(node, sourceFile);
    inputs.push(...signalIO.inputs);
    outputs.push(...signalIO.outputs);
    
    return {
      className,
      selector: args.selector as string | undefined,
      standalone: args.standalone as boolean | undefined,
      inputs: inputs.length > 0 ? inputs : undefined,
      outputs: outputs.length > 0 ? outputs : undefined,
    };
  }
  
  return null;
}

/**
 * Extract component from a TypeScript file
 */
async function extractComponent(file: DiscoveredFile, projectRoot?: string): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  const sourceFile = ts.createSourceFile(
    file.path,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  // Visit all class declarations
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const component = extractComponentDecorator(node, sourceFile);
      if (component) {
        assertions.push({
          elementId: `component:${toPosixPath(file.relativePath)}:${component.className}`,
          elementType: 'angular_component',
          file: file.relativePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          language: 'angular',
          metadata: {
            ...component,
            name: component.className,
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
  // Delegate to CSS extractor for styleUrls (if projectRoot provided)
  if (projectRoot && assertions.length > 0) {
    const componentMetadata = assertions[0].metadata;
    const styleUrls = componentMetadata.styleUrls as string[] | undefined;
    const className = componentMetadata.className as string | undefined;
    
    if (styleUrls && styleUrls.length > 0 && className) {
      const componentDir = path.dirname(file.path);
      
      for (const styleUrl of styleUrls) {
        try {
          // Resolve relative path
          const stylePath = path.resolve(componentDir, styleUrl);
          const styleRelativePath = path.relative(projectRoot, stylePath);
          
          // Check if file exists
          await fs.access(stylePath);
          
          // Delegate to CSS extractor
          const styleFile: DiscoveredFile = {
            path: stylePath,
            relativePath: styleRelativePath,
            language: 'css',
            changeType: 'unchanged',
          };
          
          const cssResult = await extractCssSemantics(styleFile, projectRoot);
          
          if (cssResult.type === 'styles') {
            const styles = cssResult.data as any;
            assertions.push({
              elementId: `styles:${toPosixPath(styleRelativePath)}`,
              elementType: 'styles',
              file: styleRelativePath,
              line: 1,
              language: 'css',
              metadata: {
                id: `styles:${toPosixPath(styleRelativePath)}`,
                parentComponent: className,
                parentFile: file.relativePath,
                classNames: styles.classes,
                cssVariablesUsed: styles.cssVariablesUsed,
                scssVariablesUsed: styles.scssVariablesUsed,
                mediaQueries: styles.mediaQueries,
                stateModifiers: styles.stateModifiers,
                hasResponsive: styles.mediaQueries.length > 0,
              },
            });
          }
        } catch {
          // Style file doesn't exist or can't be read - that's ok
          continue;
        }
      }
    }
  }
  
  return assertions;
}

/**
 * Extract service from a TypeScript file
 */
async function extractService(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  const sourceFile = ts.createSourceFile(
    file.path,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const service = extractInjectableDecorator(node, sourceFile);
      if (service) {
        assertions.push({
          elementId: `service:${toPosixPath(file.relativePath)}:${service.className}`,
          elementType: 'angular_service',
          file: file.relativePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          language: 'angular',
          metadata: {
            ...service,
            name: service.className,
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return assertions;
}

/**
 * Extract pipe from a TypeScript file
 */
async function extractPipe(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  const sourceFile = ts.createSourceFile(
    file.path,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const pipe = extractPipeDecorator(node, sourceFile);
      if (pipe) {
        assertions.push({
          elementId: `pipe:${toPosixPath(file.relativePath)}:${pipe.className}`,
          elementType: 'angular_pipe',
          file: file.relativePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          language: 'angular',
          metadata: {
            ...pipe,
            name: pipe.className,
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return assertions;
}

/**
 * Extract directive from a TypeScript file
 */
async function extractDirective(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  const sourceFile = ts.createSourceFile(
    file.path,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const directive = extractDirectiveDecorator(node, sourceFile);
      if (directive) {
        assertions.push({
          elementId: `directive:${toPosixPath(file.relativePath)}:${directive.className}`,
          elementType: 'angular_directive',
          file: file.relativePath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          language: 'angular',
          metadata: {
            ...directive,
            name: directive.className,
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return assertions;
}

/**
 * Extract guard from a TypeScript file
 */
async function extractGuard(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  const sourceFile = ts.createSourceFile(
    file.path,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      // Check for @Injectable decorator
      const service = extractInjectableDecorator(node, sourceFile);
      if (service) {
        // Check if it implements guard interfaces
        const hasCanActivate = content.includes('canActivate(');
        const hasCanDeactivate = content.includes('canDeactivate(');
        const hasCanLoad = content.includes('canLoad(');
        const hasCanMatch = content.includes('canMatch(');
        
        if (hasCanActivate || hasCanDeactivate || hasCanLoad || hasCanMatch) {
          assertions.push({
            elementId: `guard:${toPosixPath(file.relativePath)}:${service.className}`,
            elementType: 'angular_guard',
            file: file.relativePath,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            language: 'angular',
            metadata: {
              ...service,
              name: service.className,
              guardType: [
                hasCanActivate && 'canActivate',
                hasCanDeactivate && 'canDeactivate',
                hasCanLoad && 'canLoad',
                hasCanMatch && 'canMatch',
              ].filter(Boolean),
            },
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return assertions;
}

/**
 * Extract routes from a routes file
 */
async function extractRoutes(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  // Simple regex-based extraction for routes
  // Full AST parsing would be more robust but this covers common cases
  const routePatterns: AngularRoute[] = [];
  
  // Match route definitions: { path: '...', component: ... }
  const routeRegex = /\{\s*path:\s*['"]([^'"]*)['"]/g;
  let match;
  
  while ((match = routeRegex.exec(content)) !== null) {
    const routePath = match[1];
    
    // Try to find component for this route
    const componentMatch = content.slice(match.index, match.index + 200).match(/component:\s*(\w+)/);
    const guardMatch = content.slice(match.index, match.index + 200).match(/canActivate:\s*\[([^\]]+)\]/);
    const lazyMatch = content.slice(match.index, match.index + 300).match(/loadChildren:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/);
    
    routePatterns.push({
      path: routePath,
      component: componentMatch ? componentMatch[1] : undefined,
      guards: guardMatch ? guardMatch[1].split(',').map(g => g.trim()) : undefined,
      lazyLoad: lazyMatch ? lazyMatch[1] : undefined,
    });
  }
  
  if (routePatterns.length > 0) {
    assertions.push({
      elementId: `routes:${toPosixPath(file.relativePath)}`,
      elementType: 'angular_routes',
      file: file.relativePath,
      line: 1,
      language: 'angular',
      metadata: {
        routes: routePatterns,
        routeCount: routePatterns.length,
        hasLazyLoading: routePatterns.some(r => r.lazyLoad),
        hasGuards: routePatterns.some(r => r.guards && r.guards.length > 0),
      },
    });
  }
  
  return assertions;
}

/**
 * Extract template from an HTML file
 */
async function extractTemplate(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return assertions;
  }
  
  // Extract child component selectors (app-* pattern)
  const childComponents: Array<{ selector: string; inputs?: string[]; outputs?: string[] }> = [];
  const componentRegex = /<(app-[a-zA-Z0-9-]+)[^>]*>/g;
  let match;
  
  while ((match = componentRegex.exec(content)) !== null) {
    const selector = match[1];
    const tagContent = match[0];
    
    // Extract inputs [property]="value"
    const inputMatches = tagContent.matchAll(/\[([a-zA-Z]+)\]/g);
    const inputs = [...inputMatches].map(m => m[1]);
    
    // Extract outputs (event)="handler"
    const outputMatches = tagContent.matchAll(/\(([a-zA-Z]+)\)/g);
    const outputs = [...outputMatches].map(m => m[1]);
    
    // Only add if not already in list
    if (!childComponents.find(c => c.selector === selector)) {
      childComponents.push({
        selector,
        inputs: inputs.length > 0 ? inputs : undefined,
        outputs: outputs.length > 0 ? outputs : undefined,
      });
    }
  }
  
  // Extract directives used
  const directives: string[] = [];
  const directivePatterns = ['*ngIf', '*ngFor', '*ngSwitch', 'ngClass', 'ngStyle', 'ngModel'];
  for (const directive of directivePatterns) {
    if (content.includes(directive)) {
      directives.push(directive.replace('*', ''));
    }
  }
  
  // Extract pipes used
  const pipes: string[] = [];
  const pipeRegex = /\|\s*(\w+)/g;
  while ((match = pipeRegex.exec(content)) !== null) {
    if (!pipes.includes(match[1])) {
      pipes.push(match[1]);
    }
  }
  
  // Infer parent component from filename
  const fileName = path.basename(file.relativePath, '.html');
  const parentComponent = fileName.replace('.component', '')
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('') + 'Component';
  
  assertions.push({
    elementId: `template:${toPosixPath(file.relativePath)}`,
    elementType: 'angular_template',
    file: file.relativePath,
    line: 1,
    language: 'angular',
    metadata: {
      parentComponent,
      childComponents,
      directives,
      pipes,
      hasConditionals: directives.includes('ngIf'),
      hasLoops: directives.includes('ngFor'),
    },
  });
  
  return assertions;
}

/**
 * Main extraction entry point for Angular files.
 */
export async function extractFromAngular(
  file: DiscoveredFile,
  projectRoot?: string,
  _patterns?: AngularPatterns
): Promise<RawAssertion[]> {
  const fileType = getAngularFileType(file.relativePath);
  
  switch (fileType) {
    case 'component':
      return extractComponent(file, projectRoot);
    case 'service':
      return extractService(file);
    case 'pipe':
      return extractPipe(file);
    case 'directive':
      return extractDirective(file);
    case 'guard':
      return extractGuard(file);
    case 'routes':
      return extractRoutes(file);
    case 'template':
      return extractTemplate(file);
    default:
      return [];
  }
}

/**
 * Extract Angular files
 * Entry point for RECON extraction phase
 */
export async function extract(
  files: DiscoveredFile[],
  projectRoot: string
): Promise<RawAssertion[]> {
  const allAssertions: RawAssertion[] = [];
  
  for (const file of files) {
    try {
      const assertions = await extractFromAngular(file, projectRoot);
      allAssertions.push(...assertions);
    } catch (error) {
      console.warn(`[Angular Extractor] Failed to extract ${file.path}:`, error);
    }
  }
  
  return allAssertions;
}
