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
import path from 'node:path';
import * as ts from 'typescript';
import { execa } from 'execa';
import type { DiscoveredFile, RawAssertion } from './index.js';
import type { SupportedLanguage, JsonPatterns } from '../../config/index.js';
import { generateSliceId, toPosixPath } from '../../utils/paths.js';
import { extractFromCloudFormation } from './extraction-cloudformation.js';
import { extractFromJson } from '../../extractors/json/index.js';
import { extractFromAngular } from '../../extractors/angular/index.js';
import { extract as extractFromCss } from '../../extractors/css/index.js';

/**
 * Resolve path to Python AST parser script
 */
function getPythonParserPath(): string {
  // Works whether running from dist/ or src/
  const candidates = [
    path.resolve(process.cwd(), 'python-scripts', 'ast_parser.py'),
    path.resolve(process.cwd(), 'ste-runtime', 'python-scripts', 'ast_parser.py'),
    path.resolve(process.cwd(), '..', 'ste-runtime', 'python-scripts', 'ast_parser.py'),
  ];
  
  // Check which candidate exists
  for (const candidate of candidates) {
    try {
      if (require('fs').existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }
  
  // Fallback to first if none exist (will error later with better message)
  return candidates[0];
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
    console.log(`[RECON Extraction] Processing ${tsFiles.length} TypeScript files...`);
    for (const file of tsFiles) {
      try {
        const fileAssertions = await extractFromTypeScript(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        console.warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process Python files
  const pyFiles = byLanguage.get('python') ?? [];
  if (pyFiles.length > 0) {
    console.log(`[RECON Extraction] Processing ${pyFiles.length} Python files...`);
    for (const file of pyFiles) {
      try {
        const fileAssertions = await extractFromPython(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        console.warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process CloudFormation templates
  const cfnFiles = byLanguage.get('cloudformation') ?? [];
  if (cfnFiles.length > 0) {
    console.log(`[RECON Extraction] Processing ${cfnFiles.length} CloudFormation templates...`);
    for (const file of cfnFiles) {
      try {
        const fileAssertions = await extractFromCloudFormation(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        console.warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process JSON data files (E-ADR-005)
  const jsonFiles = byLanguage.get('json') ?? [];
  if (jsonFiles.length > 0) {
    console.log(`[RECON Extraction] Processing ${jsonFiles.length} JSON data files...`);
    for (const file of jsonFiles) {
      try {
        const fileAssertions = await extractFromJson(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        console.warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process Angular files (E-ADR-006)
  const angularFiles = byLanguage.get('angular') ?? [];
  if (angularFiles.length > 0) {
    console.log(`[RECON Extraction] Processing ${angularFiles.length} Angular files...`);
    for (const file of angularFiles) {
      try {
        const fileAssertions = await extractFromAngular(file);
        assertions.push(...fileAssertions);
      } catch (error) {
        console.warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
      }
    }
  }
  
  // Process CSS/SCSS files (E-ADR-006)
  const cssFiles = byLanguage.get('css') ?? [];
  if (cssFiles.length > 0) {
    console.log(`[RECON Extraction] Processing ${cssFiles.length} CSS/SCSS files...`);
    // Note: CSS extractor expects projectRoot as second parameter
    // But we need to pass it properly. For now, extract individually.
    for (const file of cssFiles) {
      try {
        // Extract expects (files, projectRoot) but we're calling per-file here
        // Let's call the internal extraction function instead
        const fileAssertions = await extractFromCss([file], process.cwd());
        assertions.push(...fileAssertions);
      } catch (error) {
        console.warn(`[RECON Extraction] Failed to extract from ${file.relativePath}:`, error);
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
    const { stdout } = await execa(pythonBin, [parserPath, file.path], {
      timeout: 30000,
    });
    
    const parsed = JSON.parse(stdout);
    
    // Normalize path to POSIX for consistent IDs across platforms
    const normalizedPath = toPosixPath(file.relativePath);
    
    // Extract functions - IDs include file path and line number for uniqueness per ADR-007
    // Line number is included to disambiguate nested functions with the same name
    if (Array.isArray(parsed.functions)) {
      for (const fn of parsed.functions) {
        const lineNumber = fn.lineno ?? 0;
        assertions.push({
          elementId: generateSliceId('function', normalizedPath, `${fn.name}:${lineNumber}`),
          elementType: 'function',
          file: normalizedPath,
          line: lineNumber,
          language: 'python',
          signature: buildPythonFunctionSignature(fn),
          metadata: {
            name: fn.name,
            args: fn.args ?? [],
            returns: fn.returns,
            decorators: fn.decorators ?? [],
            docstring: fn.docstring,
            async: fn.async ?? false,
          },
        });
      }
    }
    
    // Extract classes - IDs include file path for uniqueness per ADR-007
    if (Array.isArray(parsed.classes)) {
      for (const cls of parsed.classes) {
        assertions.push({
          elementId: generateSliceId('class', normalizedPath, cls.name),
          elementType: 'class',
          file: normalizedPath,
          line: cls.lineno ?? 0,
          language: 'python',
          metadata: {
            name: cls.name,
            bases: cls.bases ?? [],
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
  
  function visit(node: ts.Node) {
    // Extract function declarations - IDs include file path and line number for uniqueness per ADR-007
    // Line number is included to disambiguate inner/nested functions with the same name
    if (ts.isFunctionDeclaration(node) && node.name) {
      const signature = getFunctionSignature(node);
      const lineNumber = getLineNumber(sourceFile, node);
      const jsDocInfo = extractJsDoc(node, sourceFile);
      
      assertions.push({
        elementId: generateSliceId('function', normalizedPath, `${node.name.text}:${lineNumber}`),
        elementType: 'function',
        file: normalizedPath,
        line: lineNumber,
        language: 'typescript',
        signature,
        metadata: {
          name: node.name.text,
          isExported: hasExportModifier(node),
          isAsync: !!(node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
          parameters: node.parameters.map(p => p.name.getText(sourceFile)),
          ...jsDocInfo,
        },
      });
    }
    
    // Extract class declarations - IDs include file path for uniqueness per ADR-007
    if (ts.isClassDeclaration(node) && node.name) {
      const jsDocInfo = extractJsDoc(node, sourceFile);
      
      assertions.push({
        elementId: generateSliceId('class', normalizedPath, node.name.text),
        elementType: 'class',
        file: normalizedPath,
        line: getLineNumber(sourceFile, node),
        language: 'typescript',
        metadata: {
          name: node.name.text,
          isExported: hasExportModifier(node),
          methods: extractClassMethods(node, sourceFile),
          properties: extractClassProperties(node, sourceFile),
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
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  
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

function extractImportedNames(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): string[] {
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
