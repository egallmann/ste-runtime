/**
 * RECON Phase 2: Extraction
 * 
 * Extract semantic assertions from source files.
 * Supports multiple languages:
 * - TypeScript/JavaScript: Native AST parsing
 * - Python: External AST parser script
 * - CloudFormation: YAML/JSON template parsing
 * 
 * Per E-ADR-001: Shallow extraction, no deep semantic analysis
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { execa } from 'execa';
import type { DiscoveredFile, RawAssertion } from './index.js';
import type { SupportedLanguage } from '../../config/index.js';
import { generateSliceId, toPosixPath } from '../../utils/paths.js';
import { extractFromCloudFormation } from './extraction-cloudformation.js';
import { extractFromJson } from '../../extractors/json/index.js';
import { extractFromAngular } from '../../extractors/angular/index.js';
import { extract as extractFromCss } from '../../extractors/css/index.js';
import { log, warn } from '../../utils/logger.js';

// Get runtime directory from this file's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// This file is in dist/recon/phases/ or src/recon/phases/, so go up 3 levels to runtime root
const RUNTIME_DIR = path.resolve(__dirname, '../../..');

/**
 * Resolve path to Python AST parser script.
 * Uses the runtime directory (where ste-runtime is installed) rather than process.cwd()
 * which may be different when running as an MCP server.
 */
function getPythonParserPath(): string {
  // Primary: look in the runtime directory (where this code is installed)
  const runtimeScript = path.resolve(RUNTIME_DIR, 'python-scripts', 'ast_parser.py');
  if (fsSync.existsSync(runtimeScript)) {
    return runtimeScript;
  }
  
  // Fallback candidates for development/testing scenarios
  const candidates = [
    path.resolve(process.cwd(), 'python-scripts', 'ast_parser.py'),
    path.resolve(process.cwd(), 'ste-runtime-private', 'python-scripts', 'ast_parser.py'),
  ];
  
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  
  // Return the runtime path (will error with helpful message if missing)
  return runtimeScript;
}

/**
 * Get Python binary to use
 */
function getPythonBinary(): string {
  return process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'python' : 'python3');
}

/**
 * Extract semantic assertions from discovered files.
 * Dispatches to language-specific extractors.
 */
export async function extractAssertions(files: DiscoveredFile[]): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  // Group files by language for batch processing
  const byLanguage = new Map<SupportedLanguage, DiscoveredFile[]>();
  for (const file of files) {
    const group = byLanguage.get(file.language) ?? [];
    group.push(file);
    byLanguage.set(file.language, group);
  }
  
  // Process TypeScript files
  const tsFiles = byLanguage.get('typescript') ?? [];
  if (tsFiles.length > 0) {
    log(`[RECON Extraction] Processing ${tsFiles.length} TypeScript files...`);
    for (const file of tsFiles) {
      try {
        const fileAssertions = await extractFromTypeScript(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process Python files
  const pyFiles = byLanguage.get('python') ?? [];
  if (pyFiles.length > 0) {
    log(`[RECON Extraction] Processing ${pyFiles.length} Python files...`);
    for (const file of pyFiles) {
      try {
        const fileAssertions = await extractFromPython(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process CloudFormation templates
  const cfnFiles = byLanguage.get('cloudformation') ?? [];
  if (cfnFiles.length > 0) {
    log(`[RECON Extraction] Processing ${cfnFiles.length} CloudFormation templates...`);
    for (const file of cfnFiles) {
      try {
        const fileAssertions = await extractFromCloudFormation(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process JSON data files (E-ADR-005)
  const jsonFiles = byLanguage.get('json') ?? [];
  if (jsonFiles.length > 0) {
    log(`[RECON Extraction] Processing ${jsonFiles.length} JSON data files...`);
    for (const file of jsonFiles) {
      try {
        const fileAssertions = await extractFromJson(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process Angular files (E-ADR-006)
  const angularFiles = byLanguage.get('angular') ?? [];
  if (angularFiles.length > 0) {
    log(`[RECON Extraction] Processing ${angularFiles.length} Angular files...`);
    for (const file of angularFiles) {
      try {
        const fileAssertions = await extractFromAngular(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process CSS/SCSS files (E-ADR-006)
  const cssFiles = byLanguage.get('css') ?? [];
  if (cssFiles.length > 0) {
    log(`[RECON Extraction] Processing ${cssFiles.length} CSS/SCSS files...`);
    // Note: CSS extractor expects projectRoot as second parameter
    // But we need to pass it properly. For now, extract individually.
    for (const file of cssFiles) {
      try {
        // Extract expects (files, projectRoot) but we're calling per-file here
        // Let's call the internal extraction function instead
        const fileAssertions = await extractFromCss([file], process.cwd());
        assertions.push(...fileAssertions);
      } catch (error) {
        warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  return assertions;
}

/**
 * Extract assertions from a Python file using the AST parser script
 */
async function extractFromPython(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  const pythonBin = getPythonBinary();
  const parserPath = getPythonParserPath();
  
  try {
    // Read file content for source extraction (Pillar 1: Rich Slices)
    // Graceful degradation: if file read fails, continue without source
    let contentLines: string[] = [];
    try {
      const content = await fs.readFile(file.path, 'utf-8');
      contentLines = content.split('\n');
    } catch {
      // File read failed (e.g., in tests with mock paths), continue without source
    }
    
    const { stdout } = await execa(pythonBin, [parserPath, file.path], {
      timeout: 30000,
    });
    
    const parsed = JSON.parse(stdout);
    
    // Normalize path to POSIX for consistent IDs across platforms
    const normalizedPath = toPosixPath(file.relativePath);
    
    // Helper to extract source lines (Pillar 1)
    const extractPythonSource = (startLine: number, endLine: number): string | undefined => {
      if (!startLine || !endLine || contentLines.length === 0) return undefined;
      const start = Math.max(0, startLine - 1);
      const end = Math.min(contentLines.length, endLine);
      return contentLines.slice(start, end).join('\n');
    };
    
    // Extract functions - IDs include file path and line number for uniqueness per ADR-007
    // Line number is included to disambiguate nested functions with the same name
    if (Array.isArray(parsed.functions)) {
      for (const fn of parsed.functions) {
        const lineNumber = fn.lineno ?? 0;
        const endLine = fn.end_lineno ?? lineNumber;
        const source = extractPythonSource(lineNumber, endLine);
        
        assertions.push({
          elementId: generateSliceId('function', normalizedPath, `${fn.name}:${lineNumber}`),
          elementType: 'function',
          file: normalizedPath,
          line: lineNumber,
          end_line: endLine,
          language: 'python',
          signature: buildPythonFunctionSignature(fn),
          source,  // Pillar 1: Embedded source
          metadata: {
            name: fn.name,
            args: fn.args ?? [],
            returns: fn.returns,
            decorators: fn.decorators ?? [],
            implementationIntent: fn.implementation_intent,
            docstring: fn.docstring,
            async: fn.async ?? false,
          },
        });
      }
    }
    
    // Extract classes - IDs include file path for uniqueness per ADR-007
    if (Array.isArray(parsed.classes)) {
      for (const cls of parsed.classes) {
        const lineNumber = cls.lineno ?? 0;
        const endLine = cls.end_lineno ?? lineNumber;
        const source = extractPythonSource(lineNumber, endLine);
        
        assertions.push({
          elementId: generateSliceId('class', normalizedPath, cls.name),
          elementType: 'class',
          file: normalizedPath,
          line: lineNumber,
          end_line: endLine,
          language: 'python',
          source,  // Pillar 1: Embedded source
          metadata: {
            name: cls.name,
            bases: cls.bases ?? [],
            decorators: cls.decorators ?? [],
            implementationIntent: cls.implementation_intent,
            methods: (cls.methods ?? []).map((m: any) => m.name),
            docstring: cls.docstring,
          },
        });
      }
    }
    
    // Extract imports - IDs include file path for uniqueness per ADR-007
    if (Array.isArray(parsed.imports)) {
      for (const imp of parsed.imports) {
        assertions.push({
          elementId: generateSliceId('import', normalizedPath, imp.module),
          elementType: 'import',
          file: normalizedPath,
          line: 0,
          language: 'python',
          metadata: {
            module: imp.module,
            names: imp.names ?? [],
            alias: imp.alias,
          },
        });
      }
    }
    
    // Extract API endpoints - IDs include file path for uniqueness per ADR-007
    if (Array.isArray(parsed.api_endpoints)) {
      for (const endpoint of parsed.api_endpoints) {
        assertions.push({
          elementId: `api_endpoint:${normalizedPath}:${endpoint.method}:${endpoint.path}`,
          elementType: 'api_endpoint',
          file: normalizedPath,
          line: endpoint.lineno ?? 0,
          language: 'python',
          metadata: {
            framework: endpoint.framework,
            method: endpoint.method,
            path: endpoint.path,
            function_name: endpoint.function_name,
            docstring: endpoint.docstring,
          },
        });
      }
    }
    
    // Extract data models - IDs include file path for uniqueness per ADR-007
    if (Array.isArray(parsed.data_models)) {
      for (const model of parsed.data_models) {
        assertions.push({
          elementId: generateSliceId('data_model', normalizedPath, model.name),
          elementType: 'data_model',
          file: normalizedPath,
          line: model.lineno ?? 0,
          language: 'python',
          metadata: {
            name: model.name,
            fields: model.fields ?? [],
            docstring: model.docstring,
          },
        });
      }
    }
    
    // NEW: Extract AWS SDK usage (boto3/botocore calls)
    if (Array.isArray(parsed.aws_sdk_usage) && parsed.aws_sdk_usage.length > 0) {
      assertions.push({
        elementId: generateSliceId('aws_sdk_usage', normalizedPath, 'module'),
        elementType: 'aws_sdk_usage',
        file: normalizedPath,
        line: 0,
        language: 'python',
        metadata: {
          // SDK clients/resources created
          clients: parsed.aws_sdk_usage
            .filter((u: any) => u.type === 'sdk_client')
            .map((u: any) => ({
              service: u.service,
              method: u.method,
              lineno: u.lineno,
            })),
          // SDK operations performed
          operations: parsed.aws_sdk_usage
            .filter((u: any) => u.type === 'sdk_call')
            .map((u: any) => ({
              method: u.method,
              operationType: u.operation_type,
              target: u.target,
              lineno: u.lineno,
            })),
          // Summary for quick lookup
          services: [...new Set(
            parsed.aws_sdk_usage
              .filter((u: any) => u.type === 'sdk_client')
              .map((u: any) => u.service)
          )],
          hasReadOperations: parsed.aws_sdk_usage.some((u: any) => u.operation_type === 'read'),
          hasWriteOperations: parsed.aws_sdk_usage.some((u: any) => u.operation_type === 'write'),
        },
      });
    }
    
    // NEW: Extract environment variable access
    if (Array.isArray(parsed.env_var_access) && parsed.env_var_access.length > 0) {
      assertions.push({
        elementId: generateSliceId('env_var_access', normalizedPath, 'module'),
        elementType: 'env_var_access',
        file: normalizedPath,
        line: 0,
        language: 'python',
        metadata: {
          variables: parsed.env_var_access.map((v: any) => ({
            name: v.name,
            accessType: v.access_type,
            lineno: v.lineno,
          })),
          // Summary for quick lookup
          variableNames: [...new Set(parsed.env_var_access.map((v: any) => v.name))],
        },
      });
    }
    
    // NEW: Extract function call graph
    if (parsed.function_calls && Object.keys(parsed.function_calls).length > 0) {
      assertions.push({
        elementId: generateSliceId('function_calls', normalizedPath, 'module'),
        elementType: 'function_calls',
        file: normalizedPath,
        line: 0,
        language: 'python',
        metadata: {
          callGraph: parsed.function_calls,
          // Summary: functions that call other functions
          callers: Object.keys(parsed.function_calls),
        },
      });
    }
    
  } catch (error: any) {
    const stderr = error?.stderr ?? error?.message ?? String(error);
    throw new Error(`Python extraction failed: ${stderr}`);
  }
  
  return assertions;
}

function buildPythonFunctionSignature(fn: any): string {
  const args = (fn.args ?? []).join(', ');
  const returns = fn.returns ? ` -> ${fn.returns}` : '';
  const asyncPrefix = fn.async ? 'async ' : '';
  return `${asyncPrefix}def ${fn.name}(${args})${returns}`;
}

/**
 * Extract JSDoc information from a TypeScript node
 */
interface JsDocInfo {
  description?: string;
  docstring?: string;
  params?: Array<{ name: string; type?: string; description?: string }>;
  returns?: { type?: string; description?: string };
  examples?: string[];
  deprecated?: boolean;
  tags?: string[];
}

function extractJsDoc(node: ts.Node, sourceFile: ts.SourceFile): JsDocInfo {
  const jsDocNodes = (node as any).jsDoc as ts.JSDoc[] | undefined;
  if (!jsDocNodes || jsDocNodes.length === 0) {
    return {};
  }
  
  const jsDoc = jsDocNodes[0]; // Get first JSDoc block
  const info: JsDocInfo = {};
  
  // Extract full comment text
  if (jsDoc.comment) {
    const fullText = typeof jsDoc.comment === 'string' 
      ? jsDoc.comment 
      : jsDoc.comment.map((part: any) => part.text).join('');
    
    info.docstring = fullText.trim();
    
    // Extract description (first paragraph/line)
    const firstParagraph = fullText.split('\n\n')[0].trim();
    if (firstParagraph) {
      info.description = firstParagraph;
    }
  }
  
  // Extract JSDoc tags
  if (jsDoc.tags && Array.isArray(jsDoc.tags)) {
    const params: Array<{ name: string; type?: string; description?: string }> = [];
    const examples: string[] = [];
    const customTags: string[] = [];
    
    for (const tag of jsDoc.tags) {
      const tagName = tag.tagName.text;
      
      // @param tags
      if (tagName === 'param' && ts.isJSDocParameterTag(tag)) {
        const paramName = tag.name?.getText(sourceFile) ?? '';
        const paramType = tag.typeExpression?.type?.getText(sourceFile);
        let paramDesc = typeof tag.comment === 'string'
          ? tag.comment
          : tag.comment?.map((part: any) => part.text).join('') ?? '';
        
        // Remove leading "- " if present (common JSDoc formatting)
        paramDesc = paramDesc.trim().replace(/^-\s*/, '');
        
        params.push({
          name: paramName,
          type: paramType,
          description: paramDesc || undefined,
        });
      }
      
      // @returns or @return tags
      if ((tagName === 'returns' || tagName === 'return') && ts.isJSDocReturnTag(tag)) {
        const returnType = tag.typeExpression?.type?.getText(sourceFile);
        const returnDesc = typeof tag.comment === 'string'
          ? tag.comment
          : tag.comment?.map((part: any) => part.text).join('') ?? '';
        
        info.returns = {
          type: returnType,
          description: returnDesc.trim() || undefined,
        };
      }
      
      // @example tags
      if (tagName === 'example') {
        const exampleText = typeof tag.comment === 'string'
          ? tag.comment
          : tag.comment?.map((part: any) => part.text).join('') ?? '';
        
        if (exampleText.trim()) {
          examples.push(exampleText.trim());
        }
      }
      
      // @deprecated tag
      if (tagName === 'deprecated') {
        info.deprecated = true;
      }
      
      // Custom tags (e.g., @category, @tag)
      if (['category', 'tag', 'internal', 'beta', 'alpha', 'experimental'].includes(tagName)) {
        const tagValue = typeof tag.comment === 'string'
          ? tag.comment
          : tag.comment?.map((part: any) => part.text).join('') ?? '';
        
        customTags.push(tagValue.trim() ? `${tagName}:${tagValue.trim()}` : tagName);
      }
    }
    
    if (params.length > 0) {
      info.params = params;
    }
    if (examples.length > 0) {
      info.examples = examples;
    }
    if (customTags.length > 0) {
      info.tags = customTags;
    }
  }
  
  return info;
}

/**
 * Extract assertions from a TypeScript file using the TypeScript compiler API
 */
async function extractFromTypeScript(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  // Normalize path to POSIX for consistent IDs across platforms
  const normalizedPath = toPosixPath(file.relativePath);
  
  const content = await fs.readFile(file.path, 'utf-8');
  const sourceFile = ts.createSourceFile(
    normalizedPath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  // Behavioral extraction collectors
  const awsSdkImports: Array<{ service: string; names: string[]; lineno: number }> = [];
  const envVarAccess: Array<{ name: string; accessType: string; lineno: number }> = [];
  const functionCalls: Record<string, string[]> = {};
  // Track constructor calls per calling function: { callerFn: [className, ...] }
  const constructorCallsByFunction: Record<string, string[]> = {};
  // Track method calls per calling function: { callerFn: [methodName, ...] }
  const methodCallsByFunction: Record<string, string[]> = {};
  // All constructor and method calls for summary
  const allConstructorCalls: Array<{ className: string; lineno: number; caller?: string }> = [];
  const allMethodCalls: Array<{ target: string; method: string; lineno: number; caller?: string }> = [];
  let currentFunction: string | null = null;
  
  function visit(node: ts.Node) {
    // Extract function declarations - IDs include file path and line number for uniqueness per ADR-007
    // Line number is included to disambiguate inner/nested functions with the same name
    if (ts.isFunctionDeclaration(node) && node.name) {
      const signature = getFunctionSignature(node);
      const lineNumber = getLineNumber(sourceFile, node);
      const endLineNumber = getEndLineNumber(sourceFile, node);
      const jsDocInfo = extractJsDoc(node, sourceFile);
      
      // Pillar 1: Rich Slices - capture source code
      const source = extractSourceLines(content, lineNumber, endLineNumber);
      
      assertions.push({
        elementId: generateSliceId('function', normalizedPath, `${node.name.text}:${lineNumber}`),
        elementType: 'function',
        file: normalizedPath,
        line: lineNumber,
        end_line: endLineNumber,
        language: 'typescript',
        signature,
        source,  // Pillar 1: Embedded source
        metadata: {
          name: node.name.text,
          isExported: hasExportModifier(node),
          isAsync: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
          parameters: node.parameters.map(p => p.name.getText(sourceFile)),
          ...jsDocInfo,
        },
      });
      
      // Track function context for call graph
      const previousFunction = currentFunction;
      currentFunction = node.name.text;
      ts.forEachChild(node, visit);
      currentFunction = previousFunction;
      return; // Don't visit children again
    }
    
    // Extract class declarations - IDs include file path for uniqueness per ADR-007
    if (ts.isClassDeclaration(node) && node.name) {
      const jsDocInfo = extractJsDoc(node, sourceFile);
      const className = node.name.text;
      const methods = extractClassMethods(node, sourceFile);
      const classStartLine = getLineNumber(sourceFile, node);
      const classEndLine = getEndLineNumber(sourceFile, node);
      
      // Pillar 1: Rich Slices - capture source code
      const source = extractSourceLines(content, classStartLine, classEndLine);
      
      assertions.push({
        elementId: generateSliceId('class', normalizedPath, className),
        elementType: 'class',
        file: normalizedPath,
        line: classStartLine,
        end_line: classEndLine,
        language: 'typescript',
        source,  // Pillar 1: Embedded source
        metadata: {
          name: className,
          isExported: hasExportModifier(node),
          methods,
          properties: extractClassProperties(node, sourceFile),
          ...jsDocInfo,
        },
      });
      
      // Also extract class methods as separate function nodes for searchability
      node.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const lineNumber = getLineNumber(sourceFile, member);
          const methodEndLine = getEndLineNumber(sourceFile, member);
          const methodJsDoc = extractJsDoc(member, sourceFile);
          
          // Pillar 1: Rich Slices - capture method source
          const methodSource = extractSourceLines(content, lineNumber, methodEndLine);
          
          assertions.push({
            elementId: generateSliceId('function', normalizedPath, `${className}.${methodName}:${lineNumber}`),
            elementType: 'function',
            file: normalizedPath,
            line: lineNumber,
            end_line: methodEndLine,
            language: 'typescript',
            signature: `${className}.${methodName}()`,
            source: methodSource,  // Pillar 1: Embedded source
            metadata: {
              name: methodName,
              className,
              isMethod: true,
              isExported: hasExportModifier(node), // Same visibility as class
              isAsync: !!(member.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
              isStatic: !!(member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword)),
              parameters: member.parameters.map(p => p.name.getText(sourceFile)),
              ...methodJsDoc,
            },
          });
        }
      });
    }
    
    // Extract interface declarations
    if (ts.isInterfaceDeclaration(node) && node.name) {
      const jsDocInfo = extractJsDoc(node, sourceFile);
      const interfaceProperties: string[] = [];
      
      node.members.forEach(member => {
        if (ts.isPropertySignature(member) && member.name) {
          interfaceProperties.push(member.name.getText(sourceFile));
        }
      });
      
      assertions.push({
        elementId: generateSliceId('interface', normalizedPath, node.name.text),
        elementType: 'class', // Use 'class' type for interfaces (same domain)
        file: normalizedPath,
        line: getLineNumber(sourceFile, node),
        end_line: getEndLineNumber(sourceFile, node),
        language: 'typescript',
        metadata: {
          name: node.name.text,
          isInterface: true,
          isExported: hasExportModifier(node),
          properties: interfaceProperties,
          ...jsDocInfo,
        },
      });
    }
    
    // Extract type alias declarations
    if (ts.isTypeAliasDeclaration(node) && node.name) {
      const jsDocInfo = extractJsDoc(node, sourceFile);
      
      assertions.push({
        elementId: generateSliceId('type', normalizedPath, node.name.text),
        elementType: 'class', // Use 'class' type for type aliases (same domain)
        file: normalizedPath,
        line: getLineNumber(sourceFile, node),
        end_line: getEndLineNumber(sourceFile, node),
        language: 'typescript',
        metadata: {
          name: node.name.text,
          isTypeAlias: true,
          isExported: hasExportModifier(node),
          typeDefinition: node.type?.getText(sourceFile)?.substring(0, 200), // Truncate for safety
          ...jsDocInfo,
        },
      });
    }
    
    // Extract enum declarations
    if (ts.isEnumDeclaration(node) && node.name) {
      const jsDocInfo = extractJsDoc(node, sourceFile);
      const enumMembers: string[] = [];
      
      node.members.forEach(member => {
        if (member.name) {
          enumMembers.push(member.name.getText(sourceFile));
        }
      });
      
      assertions.push({
        elementId: generateSliceId('enum', normalizedPath, node.name.text),
        elementType: 'class', // Use 'class' type for enums (same domain)
        file: normalizedPath,
        line: getLineNumber(sourceFile, node),
        end_line: getEndLineNumber(sourceFile, node),
        language: 'typescript',
        metadata: {
          name: node.name.text,
          isEnum: true,
          isExported: hasExportModifier(node),
          members: enumMembers,
          ...jsDocInfo,
        },
      });
    }
    
    // Extract imports - IDs include file path for uniqueness per ADR-007
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
      const importedNames = extractImportedNames(node, sourceFile);
      
      assertions.push({
        elementId: generateSliceId('import', normalizedPath, moduleSpecifier),
        elementType: 'import',
        file: normalizedPath,
        line: getLineNumber(sourceFile, node),
        language: 'typescript',
        metadata: {
          module: moduleSpecifier,
          names: importedNames,
        },
      });
      
      // Behavioral: Track AWS SDK imports
      if (moduleSpecifier.startsWith('@aws-sdk/')) {
        const service = moduleSpecifier.replace('@aws-sdk/', '').split('/')[0];
        awsSdkImports.push({
          service,
          names: importedNames,
          lineno: getLineNumber(sourceFile, node),
        });
      }
    }
    
    // Extract exports - IDs include file path for uniqueness per ADR-007
    if (ts.isExportDeclaration(node) && node.exportClause) {
      if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          assertions.push({
            elementId: generateSliceId('export', normalizedPath, element.name.text),
            elementType: 'export',
            file: normalizedPath,
            line: getLineNumber(sourceFile, node),
            language: 'typescript',
            metadata: {
              name: element.name.text,
              exportType: 'named',
            },
          });
        }
      }
    }
    
    // Behavioral: Track process.env access
    if (ts.isPropertyAccessExpression(node)) {
      const text = node.getText(sourceFile);
      if (text.startsWith('process.env.')) {
        const envVar = text.replace('process.env.', '');
        envVarAccess.push({
          name: envVar,
          accessType: 'direct',
          lineno: getLineNumber(sourceFile, node),
        });
      }
    }
    
    // Behavioral: Track process.env['VAR'] or process.env["VAR"] access
    if (ts.isElementAccessExpression(node)) {
      const expression = node.expression.getText(sourceFile);
      if (expression === 'process.env' && node.argumentExpression) {
        const arg = node.argumentExpression;
        if (ts.isStringLiteral(arg)) {
          envVarAccess.push({
            name: arg.text,
            accessType: 'bracket',
            lineno: getLineNumber(sourceFile, node),
          });
        }
      }
    }
    
    // Behavioral: Track function calls for call graph
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);
      // Track simple function calls and this.method() calls (only when inside a named function)
      if (currentFunction && (!callee.includes('.') || callee.startsWith('this.'))) {
        const simpleName = callee.replace('this.', '');
        if (!functionCalls[currentFunction]) {
          functionCalls[currentFunction] = [];
        }
        if (!functionCalls[currentFunction].includes(simpleName)) {
          functionCalls[currentFunction].push(simpleName);
        }
      }
      // Track method calls on objects (obj.method()) - works in arrow functions too
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.getText(sourceFile);
        // Get the target expression (could be identifier, another property access, etc.)
        const targetExpr = node.expression.expression;
        // Only track if the method name is meaningful (not chained calls like .then().catch())
        if (methodName.length > 1 && !['then', 'catch', 'finally'].includes(methodName)) {
          allMethodCalls.push({
            target: targetExpr.getText(sourceFile),
            method: methodName,
            lineno: getLineNumber(sourceFile, node),
            caller: currentFunction ?? undefined,
          });
          // Track by calling function for inference
          // Use special key '__module__' for calls outside named functions
          const callerKey = currentFunction ?? '__module__';
          if (!methodCallsByFunction[callerKey]) {
            methodCallsByFunction[callerKey] = [];
          }
          if (!methodCallsByFunction[callerKey].includes(methodName)) {
            methodCallsByFunction[callerKey].push(methodName);
          }
        }
      }
    }
    
    // Behavioral: Track constructor calls (new ClassName())
    if (ts.isNewExpression(node)) {
      const expression = node.expression;
      let className: string | null = null;
      
      if (ts.isIdentifier(expression)) {
        className = expression.text;
      } else if (ts.isPropertyAccessExpression(expression)) {
        // Handle namespaced classes like ns.ClassName
        className = expression.name.getText(sourceFile);
      }
      
      if (className) {
        allConstructorCalls.push({
          className,
          lineno: getLineNumber(sourceFile, node),
          caller: currentFunction ?? undefined,
        });
        // Track by calling function for inference
        // Use special key '__module__' for calls outside named functions (arrow functions, callbacks, top-level)
        const callerKey = currentFunction ?? '__module__';
        if (!constructorCallsByFunction[callerKey]) {
          constructorCallsByFunction[callerKey] = [];
        }
        if (!constructorCallsByFunction[callerKey].includes(className)) {
          constructorCallsByFunction[callerKey].push(className);
        }
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
  // Add behavioral assertions if any were found
  if (awsSdkImports.length > 0) {
    assertions.push({
      elementId: generateSliceId('aws_sdk_usage', normalizedPath, 'module'),
      elementType: 'aws_sdk_usage',
      file: normalizedPath,
      line: 0,
      language: 'typescript',
      metadata: {
        clients: awsSdkImports.map(imp => ({
          service: imp.service,
          imports: imp.names,
          lineno: imp.lineno,
        })),
        operations: [], // Would need type analysis to track SDK calls
        services: [...new Set(awsSdkImports.map(imp => imp.service))],
        hasReadOperations: false, // Cannot determine without type analysis
        hasWriteOperations: false,
      },
    });
  }
  
  if (envVarAccess.length > 0) {
    assertions.push({
      elementId: generateSliceId('env_var_access', normalizedPath, 'module'),
      elementType: 'env_var_access',
      file: normalizedPath,
      line: 0,
      language: 'typescript',
      metadata: {
        variables: envVarAccess,
        variableNames: [...new Set(envVarAccess.map(v => v.name))],
      },
    });
  }
  
  const hasCallData = Object.keys(functionCalls).length > 0 || 
    Object.keys(constructorCallsByFunction).length > 0 || 
    Object.keys(methodCallsByFunction).length > 0;
    
  if (hasCallData) {
    assertions.push({
      elementId: generateSliceId('function_calls', normalizedPath, 'module'),
      elementType: 'function_calls',
      file: normalizedPath,
      line: 0,
      language: 'typescript',
      metadata: {
        // Existing: function call graph { callerFn: [calledFn, ...] }
        callGraph: functionCalls,
        callers: Object.keys(functionCalls),
        // New: constructor call graph { callerFn: [className, ...] }
        constructorCallGraph: Object.keys(constructorCallsByFunction).length > 0 
          ? constructorCallsByFunction 
          : undefined,
        // New: method call graph { callerFn: [methodName, ...] }
        methodCallGraph: Object.keys(methodCallsByFunction).length > 0 
          ? methodCallsByFunction 
          : undefined,
        // Summaries for quick lookup
        instantiatedClasses: allConstructorCalls.length > 0 
          ? [...new Set(allConstructorCalls.map(c => c.className))]
          : undefined,
        calledMethods: allMethodCalls.length > 0
          ? [...new Set(allMethodCalls.map(m => m.method))]
          : undefined,
      },
    });
  }
  
  return assertions;
}

function getFunctionSignature(node: ts.FunctionDeclaration): string {
  const name = node.name?.text ?? 'anonymous';
  const params = node.parameters.map(p => {
    const paramName = p.name.getText();
    const paramType = p.type?.getText() ?? 'any';
    return `${paramName}: ${paramType}`;
  }).join(', ');
  
  const returnType = node.type?.getText() ?? 'void';
  
  return `function ${name}(${params}): ${returnType}`;
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!(modifiers?.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return line + 1; // TypeScript uses 0-based line numbers
}

function getEndLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return line + 1; // TypeScript uses 0-based line numbers
}

/**
 * Extract source code for a line range (Pillar 1: Rich Slices).
 * Returns the source code between startLine and endLine (1-indexed, inclusive).
 */
function extractSourceLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  // Convert to 0-indexed
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, endLine);
  return lines.slice(start, end).join('\n');
}

function extractClassMethods(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string[] {
  const methods: string[] = [];
  
  node.members.forEach(member => {
    if (ts.isMethodDeclaration(member) && member.name) {
      methods.push(member.name.getText(sourceFile));
    }
  });
  
  return methods;
}

function extractClassProperties(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string[] {
  const properties: string[] = [];
  
  node.members.forEach(member => {
    if (ts.isPropertyDeclaration(member) && member.name) {
      properties.push(member.name.getText(sourceFile));
    }
  });
  
  return properties;
}

function extractImportedNames(node: ts.ImportDeclaration, _sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];
  
  if (node.importClause) {
    // Default import
    if (node.importClause.name) {
      names.push(node.importClause.name.text);
    }
    
    // Named imports
    if (node.importClause.namedBindings) {
      if (ts.isNamedImports(node.importClause.namedBindings)) {
        node.importClause.namedBindings.elements.forEach(element => {
          names.push(element.name.text);
        });
      } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        names.push(node.importClause.namedBindings.name.text);
      }
    }
  }
  
  return names;
}
