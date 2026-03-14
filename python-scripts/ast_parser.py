#!/usr/bin/env python3
"""
AST-based extractor for Python files. Emits a JSON payload describing
functions, classes, imports, API endpoints, data models, AWS SDK usage,
environment variables, and function calls.

This is the GENERIC extraction layer for Python - it captures ALL
patterns without hardcoding specific frameworks.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

HTTP_METHODS = {"get", "post", "put", "delete", "patch", "options", "head"}

# AWS SDK method patterns for read/write classification
AWS_SDK_READ_METHODS = {
    "get_item", "query", "scan", "batch_get_item", "describe_table",
    "get_object", "head_object", "list_objects", "list_objects_v2",
    "describe_instances", "describe_stacks", "get_parameter", "get_parameters",
    "get_secret_value", "describe_secret", "get_queue_url", "receive_message",
}

AWS_SDK_WRITE_METHODS = {
    "put_item", "update_item", "delete_item", "batch_write_item",
    "put_object", "delete_object", "copy_object",
    "invoke", "invoke_async", "send_message", "send_message_batch",
    "publish", "create_stack", "update_stack", "delete_stack",
    "put_parameter", "delete_parameter", "create_secret", "update_secret",
}


def to_posix(path: Path) -> str:
    return path.resolve().as_posix()


def safe_unparse(node: Optional[ast.AST]) -> Optional[str]:
    if node is None:
        return None
    try:
        return ast.unparse(node)
    except Exception:
        return None


def literal_string(node: Optional[ast.AST]) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def strings_from_iterable(node: Optional[ast.AST]) -> List[str]:
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        values: List[str] = []
        for elt in node.elts:
            value = literal_string(elt)
            if value is not None:
                values.append(value)
        return values
    return []


def render_value(node: Optional[ast.AST]) -> Optional[str]:
    if node is None:
        return None
    try:
        value = ast.literal_eval(node)
        return repr(value)
    except Exception:
        return safe_unparse(node)


def collect_args(node: ast.AST) -> List[str]:
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return []

    args: List[str] = []
    fn_args = node.args

    for arg in fn_args.posonlyargs:
        args.append(arg.arg)
    for arg in fn_args.args:
        args.append(arg.arg)
    if fn_args.vararg:
        args.append(f"*{fn_args.vararg.arg}")
    for arg in fn_args.kwonlyargs:
        args.append(arg.arg)
    if fn_args.kwarg:
        args.append(f"**{fn_args.kwarg.arg}")

    return args


def function_to_dict(node: ast.FunctionDef | ast.AsyncFunctionDef) -> Dict[str, Any]:
    decorators = [
        dec for dec in (safe_unparse(dec) for dec in node.decorator_list) if dec
    ]
    return {
        "name": node.name,
        "lineno": getattr(node, "lineno", 0),
        "end_lineno": getattr(node, "end_lineno", getattr(node, "lineno", 0)),
        "args": collect_args(node),
        "returns": safe_unparse(node.returns),
        "decorators": decorators,
        "implementation_intent": extract_implementation_intent(node.decorator_list),
        "docstring": ast.get_docstring(node),
        "async": isinstance(node, ast.AsyncFunctionDef),
    }


def class_to_dict(node: ast.ClassDef) -> Dict[str, Any]:
    bases = [base for base in (safe_unparse(base) for base in node.bases) if base]
    decorators = [
        dec for dec in (safe_unparse(dec) for dec in node.decorator_list) if dec
    ]
    methods = [
        function_to_dict(stmt)
        for stmt in node.body
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    return {
        "name": node.name,
        "lineno": getattr(node, "lineno", 0),
        "end_lineno": getattr(node, "end_lineno", getattr(node, "lineno", 0)),
        "bases": bases,
        "decorators": decorators,
        "implementation_intent": extract_implementation_intent(node.decorator_list),
        "methods": methods,
        "docstring": ast.get_docstring(node),
    }


def extract_imports(tree: ast.AST) -> List[Dict[str, Any]]:
    imports: List[Dict[str, Any]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                entry: Dict[str, Any] = {
                    "module": alias.name,
                    "names": [alias.name],
                }
                if alias.asname:
                    entry["alias"] = alias.asname
                imports.append(entry)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                entry = {
                    "module": module,
                    "names": [alias.name],
                }
                if alias.asname:
                    entry["alias"] = alias.asname
                imports.append(entry)
    return imports


def decorator_call(node: ast.AST) -> Optional[ast.Call]:
    return node if isinstance(node, ast.Call) else None


def _decorator_name(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _string_arguments(call: ast.Call) -> List[str]:
    values: List[str] = []

    for arg in call.args:
        value = literal_string(arg)
        if value is not None:
            values.append(value)
            continue
        values.extend(strings_from_iterable(arg))

    for kw in call.keywords:
        if kw.arg not in {"adr_id", "adr_ids", "adr", "adrs", "invariant", "invariants"}:
            continue
        value = literal_string(kw.value)
        if value is not None:
            values.append(value)
            continue
        values.extend(strings_from_iterable(kw.value))

    return values


def extract_implementation_intent(decorators: Iterable[ast.AST]) -> Optional[Dict[str, Any]]:
    attributed_adrs: List[str] = []
    enforced_invariants: List[str] = []

    for decorator in decorators:
        call = decorator_call(decorator)
        if not call:
            continue
        name = _decorator_name(call.func)
        if name in {"implements_adr", "implements_adrs"}:
            attributed_adrs.extend(_string_arguments(call))
        elif name in {"enforces_invariant", "enforces_invariants"}:
            enforced_invariants.extend(_string_arguments(call))

    attributed_adrs = list(dict.fromkeys(attributed_adrs))
    enforced_invariants = list(dict.fromkeys(enforced_invariants))

    if not attributed_adrs and not enforced_invariants:
        return None

    return {
        "implements_adrs": attributed_adrs,
        "enforced_invariants": enforced_invariants,
        "confidence": "declared",
        "source": "decorator",
    }


def extract_api_endpoints(
    fn_nodes: Iterable[ast.FunctionDef | ast.AsyncFunctionDef],
) -> List[Dict[str, Any]]:
    endpoints: List[Dict[str, Any]] = []

    for node in fn_nodes:
        docstring = ast.get_docstring(node)
        lineno = getattr(node, "lineno", 0)

        for decorator in node.decorator_list:
            call = decorator_call(decorator)
            if not call or not isinstance(call.func, ast.AST):
                continue

            if isinstance(call.func, ast.Attribute):
                attr = call.func.attr

                # Flask: @app.route(...) / @blueprint.route(...)
                if attr == "route":
                    path = literal_string(call.args[0]) if call.args else None
                    methods_kw = next(
                        (kw for kw in call.keywords if kw.arg == "methods"), None
                    )
                    methods = strings_from_iterable(methods_kw.value) if methods_kw else []
                    methods = methods or ["GET"]

                    if path:
                        for method in methods:
                            endpoints.append(
                                {
                                    "framework": "flask",
                                    "method": method,
                                    "path": path,
                                    "function_name": node.name,
                                    "lineno": lineno,
                                    "docstring": docstring,
                                }
                            )
                    continue

                # FastAPI: @app.get/post/put/delete/patch/options(...)
                attr_lower = attr.lower()
                if attr_lower in HTTP_METHODS:
                    path = literal_string(call.args[0]) if call.args else None
                    if path:
                        endpoints.append(
                            {
                                "framework": "fastapi",
                                "method": attr.upper(),
                                "path": path,
                                "function_name": node.name,
                                "lineno": lineno,
                                "docstring": docstring,
                            }
                        )
                    continue

    return endpoints


def is_dataclass(node: ast.ClassDef) -> bool:
    for dec in node.decorator_list:
        dec_text = safe_unparse(dec)
        if dec_text and dec_text.endswith("dataclass"):
            return True
    return False


def is_pydantic_model(node: ast.ClassDef) -> bool:
    for base in node.bases:
        base_text = safe_unparse(base)
        if base_text and base_text.endswith("BaseModel"):
            return True
    return False


def extract_fields(node: ast.ClassDef) -> List[Dict[str, Any]]:
    fields: List[Dict[str, Any]] = []
    for stmt in node.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            field: Dict[str, Any] = {
                "name": stmt.target.id,
                "type": safe_unparse(stmt.annotation),
            }
            default_value = render_value(stmt.value)
            if default_value is not None:
                field["default"] = default_value
            fields.append(field)
    return fields


def extract_data_models(class_nodes: Iterable[ast.ClassDef]) -> List[Dict[str, Any]]:
    data_models: List[Dict[str, Any]] = []
    for node in class_nodes:
        fields = extract_fields(node)
        if not (fields or is_dataclass(node) or is_pydantic_model(node)):
            continue

        data_models.append(
            {
                "name": node.name,
                "fields": fields,
                "lineno": getattr(node, "lineno", 0),
                "docstring": ast.get_docstring(node),
            }
        )
    return data_models


def extract_aws_sdk_usage(tree: ast.AST) -> List[Dict[str, Any]]:
    """
    Extract AWS SDK (boto3/botocore) usage patterns.
    
    Finds:
    - boto3.client('service') / boto3.resource('service')
    - session.client('service') / session.resource('service')
    - SDK method calls like table.put_item(), client.get_item()
    - Classifies operations as read/write
    """
    sdk_usage: List[Dict[str, Any]] = []
    # Track variable names that are boto3 sessions
    boto3_sessions: Set[str] = set()
    
    # First pass: identify boto3 session variables
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            # Pattern: session = boto3.Session(...)
            if isinstance(node.value, ast.Call):
                if isinstance(node.value.func, ast.Attribute):
                    if node.value.func.attr == "Session":
                        if isinstance(node.value.func.value, ast.Name):
                            if node.value.func.value.id == "boto3":
                                # Record the variable name(s) as boto3 sessions
                                for target in node.targets:
                                    if isinstance(target, ast.Name):
                                        boto3_sessions.add(target.id)
    
    # Second pass: extract SDK usage
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        
        lineno = getattr(node, "lineno", 0)
        
        # Pattern 1: boto3.client('service') or boto3.resource('service')
        # Pattern 2: session.client('service') or session.resource('service')
        if isinstance(node.func, ast.Attribute):
            attr = node.func.attr
            
            # Check for boto3.client/resource or session.client/resource
            if attr in ("client", "resource"):
                is_boto3_call = False
                
                # Direct boto3 call
                if isinstance(node.func.value, ast.Name) and node.func.value.id == "boto3":
                    is_boto3_call = True
                # Session variable call
                elif isinstance(node.func.value, ast.Name) and node.func.value.id in boto3_sessions:
                    is_boto3_call = True
                
                if is_boto3_call:
                    service = None
                    if node.args and isinstance(node.args[0], ast.Constant):
                        service = node.args[0].value
                    
                    if service:
                        sdk_usage.append({
                            "type": "sdk_client",
                            "sdk": "boto3",
                            "method": attr,
                            "service": service,
                            "lineno": lineno,
                        })
                    continue
            
            # Pattern 2: SDK method calls like table.put_item(), client.get_item()
            method_name = attr.lower()
            
            # Check if it's a known AWS SDK method
            if method_name in AWS_SDK_READ_METHODS:
                sdk_usage.append({
                    "type": "sdk_call",
                    "method": attr,
                    "operation_type": "read",
                    "lineno": lineno,
                    "target": safe_unparse(node.func.value),
                })
            elif method_name in AWS_SDK_WRITE_METHODS:
                sdk_usage.append({
                    "type": "sdk_call",
                    "method": attr,
                    "operation_type": "write",
                    "lineno": lineno,
                    "target": safe_unparse(node.func.value),
                })
    
    return sdk_usage


def extract_env_var_access(tree: ast.AST) -> List[Dict[str, Any]]:
    """
    Extract environment variable access patterns.
    
    Finds:
    - os.environ['VAR_NAME']
    - os.environ.get('VAR_NAME')
    - os.getenv('VAR_NAME')
    """
    env_vars: List[Dict[str, Any]] = []
    
    for node in ast.walk(tree):
        lineno = getattr(node, "lineno", 0)
        
        # Pattern 1: os.environ['VAR_NAME'] (Subscript)
        if isinstance(node, ast.Subscript):
            if isinstance(node.value, ast.Attribute):
                if node.value.attr == "environ":
                    if isinstance(node.value.value, ast.Name) and node.value.value.id == "os":
                        var_name = None
                        if isinstance(node.slice, ast.Constant):
                            var_name = node.slice.value
                        
                        if var_name:
                            env_vars.append({
                                "name": var_name,
                                "access_type": "subscript",
                                "lineno": lineno,
                            })
        
        # Pattern 2: os.environ.get('VAR_NAME') or os.getenv('VAR_NAME')
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                # os.environ.get('VAR_NAME')
                if node.func.attr == "get":
                    if isinstance(node.func.value, ast.Attribute):
                        if node.func.value.attr == "environ":
                            if isinstance(node.func.value.value, ast.Name) and node.func.value.value.id == "os":
                                var_name = None
                                if node.args and isinstance(node.args[0], ast.Constant):
                                    var_name = node.args[0].value
                                
                                if var_name:
                                    env_vars.append({
                                        "name": var_name,
                                        "access_type": "get",
                                        "lineno": lineno,
                                    })
                
                # os.getenv('VAR_NAME')
                if node.func.attr == "getenv":
                    if isinstance(node.func.value, ast.Name) and node.func.value.id == "os":
                        var_name = None
                        if node.args and isinstance(node.args[0], ast.Constant):
                            var_name = node.args[0].value
                        
                        if var_name:
                            env_vars.append({
                                "name": var_name,
                                "access_type": "getenv",
                                "lineno": lineno,
                            })
    
    return env_vars


def extract_function_calls(
    fn_nodes: Iterable[ast.FunctionDef | ast.AsyncFunctionDef],
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extract function calls within each function body.
    
    Returns a dict mapping function name to list of calls made.
    This enables building call graphs.
    """
    calls_by_function: Dict[str, List[Dict[str, Any]]] = {}
    
    for fn_node in fn_nodes:
        fn_name = fn_node.name
        calls: List[Dict[str, Any]] = []
        
        for node in ast.walk(fn_node):
            if not isinstance(node, ast.Call):
                continue
            
            lineno = getattr(node, "lineno", 0)
            
            # Get the called function name
            if isinstance(node.func, ast.Name):
                # Direct function call: foo()
                calls.append({
                    "name": node.func.id,
                    "type": "direct",
                    "lineno": lineno,
                })
            elif isinstance(node.func, ast.Attribute):
                # Method call: obj.method()
                method = node.func.attr
                target = safe_unparse(node.func.value)
                calls.append({
                    "name": method,
                    "type": "method",
                    "target": target,
                    "lineno": lineno,
                })
        
        if calls:
            calls_by_function[fn_name] = calls
    
    return calls_by_function


def parse_file(filepath: str) -> Dict[str, Any]:
    path = Path(filepath)
    try:
        source = path.read_text(encoding="utf-8")
    except Exception as exc:  # pragma: no cover - IO error path
        raise RuntimeError(f"Failed to read {filepath}: {exc}") from exc

    tree = ast.parse(source, filename=str(path))

    module_functions = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    class_nodes = [node for node in tree.body if isinstance(node, ast.ClassDef)]

    functions = [function_to_dict(node) for node in module_functions]
    classes = [class_to_dict(node) for node in class_nodes]
    imports = extract_imports(tree)

    # Collect all function nodes (module-level and class methods)
    all_fn_nodes: List[ast.FunctionDef | ast.AsyncFunctionDef] = []
    all_fn_nodes.extend(module_functions)
    for cls in class_nodes:
        for stmt in cls.body:
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                all_fn_nodes.append(stmt)

    api_endpoints = extract_api_endpoints(all_fn_nodes)
    data_models = extract_data_models(class_nodes)
    
    # NEW: AWS SDK usage extraction
    aws_sdk_usage = extract_aws_sdk_usage(tree)
    
    # NEW: Environment variable access extraction
    env_var_access = extract_env_var_access(tree)
    
    # NEW: Function call graph extraction
    function_calls = extract_function_calls(all_fn_nodes)

    return {
        "filepath": to_posix(path),
        "language": "python",
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "api_endpoints": api_endpoints,
        "data_models": data_models,
        # NEW fields for semantic understanding
        "aws_sdk_usage": aws_sdk_usage,
        "env_var_access": env_var_access,
        "function_calls": function_calls,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Python AST extractor for STE runtime")
    parser.add_argument("filepath", help="Python file to parse")
    args = parser.parse_args()

    try:
        payload = parse_file(args.filepath)
    except SyntaxError as exc:
        sys.stderr.write(f"SyntaxError in {args.filepath}: {exc}\n")
        sys.exit(1)
    except Exception as exc:  # pragma: no cover - unexpected failures
        sys.stderr.write(f"Failed to process {args.filepath}: {exc}\n")
        sys.exit(1)

    print(json.dumps(payload))


if __name__ == "__main__":
    main()
