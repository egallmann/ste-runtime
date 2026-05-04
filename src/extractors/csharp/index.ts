/**
 * C#/.NET extractor (MP-4c).
 *
 * Regex-based shallow extraction of:
 * - Classes (including controllers with [Route] attributes)
 * - ASP.NET controller action routes ([HttpGet], [HttpPost], etc.)
 * - Dependency injection registrations (services.Add*)
 * - Functions/methods
 */

import fs from 'node:fs/promises';
import type { DiscoveredFile, RawAssertion } from '../../recon/phases/index.js';
import { generateSliceId, toPosixPath } from '../../utils/paths.js';

const ROUTE_ATTR_RE = /\[Route\("([^"]+)"\)\]/;
const HTTP_METHOD_RE = /\[(Http(Get|Post|Put|Delete|Patch|Options|Head))(?:\("([^"]*)"\))?\]/;
const CLASS_RE = /^[\t ]*(?:public|internal|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:partial\s+)?class\s+(\w+)(?:\s*:\s*([^\n{]+))?/gm;
const METHOD_RE = /^[\t ]*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(?:async\s+)?(?:[\w<>\[\]?,\s]+?)\s+(\w+)\s*\(/gm;
const DI_REG_RE = /services\.(AddScoped|AddSingleton|AddTransient|AddHostedService|AddHttpClient)<([^>]+)>/g;
const NAMESPACE_RE = /^namespace\s+([\w.]+)/m;

export async function extractFromCsharp(file: DiscoveredFile): Promise<RawAssertion[]> {
  const content = await fs.readFile(file.path, 'utf-8');
  const normalizedPath = toPosixPath(file.relativePath);
  const assertions: RawAssertion[] = [];
  const lines = content.split('\n');

  const nsMatch = content.match(NAMESPACE_RE);
  const namespace = nsMatch?.[1] ?? null;

  let classMatch: RegExpExecArray | null;
  CLASS_RE.lastIndex = 0;
  while ((classMatch = CLASS_RE.exec(content)) !== null) {
    const className = classMatch[1];
    const bases = classMatch[2]?.trim() ?? '';
    const lineNum = content.substring(0, classMatch.index).split('\n').length;
    const isController = bases.includes('Controller') || bases.includes('ControllerBase');

    let routePrefix: string | null = null;
    if (lineNum > 1) {
      for (let i = lineNum - 2; i >= Math.max(0, lineNum - 5); i--) {
        const rm = lines[i]?.match(ROUTE_ATTR_RE);
        if (rm) { routePrefix = rm[1]; break; }
      }
    }

    assertions.push({
      elementId: generateSliceId('class', normalizedPath, className),
      elementType: 'class',
      file: normalizedPath,
      line: lineNum,
      language: 'csharp',
      metadata: {
        name: className,
        namespace,
        bases: bases ? bases.split(',').map(b => b.trim()) : [],
        isController,
        routePrefix,
      },
    });

    if (isController && routePrefix !== null) {
      const classBodyStart = content.indexOf('{', classMatch.index);
      if (classBodyStart === -1) continue;
      let depth = 1;
      let pos = classBodyStart + 1;
      while (pos < content.length && depth > 0) {
        if (content[pos] === '{') depth++;
        else if (content[pos] === '}') depth--;
        pos++;
      }
      const classBody = content.substring(classBodyStart, pos);
      const bodyLines = classBody.split('\n');

      for (let i = 0; i < bodyLines.length; i++) {
        const httpMatch = bodyLines[i].match(HTTP_METHOD_RE);
        if (!httpMatch) continue;
        const httpMethod = httpMatch[2].toUpperCase();
        const routeSuffix = httpMatch[3] ?? '';
        const fullRoute = routePrefix + (routeSuffix ? '/' + routeSuffix : '');

        const methodLine = bodyLines.slice(i + 1, i + 5).join('\n');
        const mMatch = methodLine.match(/(?:public|private|protected|internal)\s+(?:async\s+)?[\w<>\[\]?,\s]+?\s+(\w+)\s*\(/);
        const actionName = mMatch?.[1] ?? 'unknown';

        assertions.push({
          elementId: generateSliceId('api_endpoint', normalizedPath, `${httpMethod}:${fullRoute}`),
          elementType: 'api_endpoint',
          file: normalizedPath,
          line: lineNum + i,
          language: 'csharp',
          metadata: {
            method: httpMethod,
            path: fullRoute,
            controller: className,
            action: actionName,
            framework: 'aspnet',
          },
        });
      }
    }
  }

  let diMatch: RegExpExecArray | null;
  DI_REG_RE.lastIndex = 0;
  while ((diMatch = DI_REG_RE.exec(content)) !== null) {
    const lifetime = diMatch[1].replace('Add', '').toLowerCase();
    const typeArgs = diMatch[2];
    const lineNum = content.substring(0, diMatch.index).split('\n').length;
    const parts = typeArgs.split(',').map(t => t.trim());
    const iface = parts[0];
    const impl = parts[1] ?? parts[0];

    assertions.push({
      elementId: generateSliceId('dependency', normalizedPath, `di:${impl}`),
      elementType: 'dependency',
      file: normalizedPath,
      line: lineNum,
      language: 'csharp',
      metadata: {
        kind: 'di_registration',
        lifetime,
        interface: iface,
        implementation: impl,
      },
    });
  }

  return assertions;
}
