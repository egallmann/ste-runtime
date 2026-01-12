"""Task Analysis MVP: map natural-language tasks to AI-DOC entry points.

Usage:
  python python-scripts/task_analysis.py --task "list users" --state .ste/state --format table
  python python-scripts/task_analysis.py --task "create user POST" --format json

If PyYAML is missing, install with `pip install pyyaml`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime
    yaml = None


# -----------------------------
# Data structures
# -----------------------------


@dataclass(frozen=True)
class Endpoint:
    id: str
    method: str
    path: str
    summary: str
    domain_function: str
    handler_file: str


@dataclass(frozen=True)
class Entity:
    id: str
    name: str
    description: str
    source_file: str


@dataclass(frozen=True)
class Module:
    id: str
    name: str
    path: str


@dataclass(frozen=True)
class Candidate:
    id: str
    domain: str
    type: str
    title: str
    description: str
    score: float
    rationale: str
    location: Optional[str] = None


@dataclass(frozen=True)
class AidocState:
    endpoints: List[Endpoint]
    entities: List[Entity]
    modules: List[Module]


# -----------------------------
# Utility helpers
# -----------------------------


def _ensure_yaml_available() -> None:
    if yaml is None:
        raise RuntimeError("PyYAML is required. Install with `pip install pyyaml`.")


def _safe_load_yaml(path: Path) -> Dict:
    _ensure_yaml_available()
    try:
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data
    except FileNotFoundError:
        return {}


def _tokenize(text: str) -> List[str]:
    text = text.lower()
    text = re.sub(r"[^a-z0-9/]+", " ", text)
    return [tok for tok in text.split() if tok]


def _path_tokens(path_value: str) -> List[str]:
    return [segment for segment in re.split(r"[\\/]", path_value) if segment]


def _unique(seq: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


# -----------------------------
# AI-DOC state loading
# -----------------------------


def _load_endpoints(state_root: Path) -> List[Endpoint]:
    endpoints_dir = state_root / "api" / "endpoints"
    if not endpoints_dir.exists():
        return []

    endpoints: List[Endpoint] = []
    for file_path in sorted(endpoints_dir.glob("*.yaml")):
        data = _safe_load_yaml(file_path)
        ep = data.get("endpoint", {}) if isinstance(data, dict) else {}
        if not ep:
            continue
        endpoints.append(
            Endpoint(
                id=str(ep.get("id", "")),
                method=str(ep.get("method", "")).upper(),
                path=str(ep.get("path", "")),
                summary=str(ep.get("summary", "")),
                domain_function=str(ep.get("domain_function", "")),
                handler_file=str(ep.get("handler", {}).get("file", "")),
            )
        )
    return endpoints


def _load_entities(state_root: Path) -> List[Entity]:
    entities_dir = state_root / "data" / "entities"
    if not entities_dir.exists():
        return []

    entities: List[Entity] = []
    for file_path in sorted(entities_dir.glob("*.yaml")):
        data = _safe_load_yaml(file_path)
        ent = data.get("entity", {}) if isinstance(data, dict) else {}
        if not ent:
            continue
        entities.append(
            Entity(
                id=str(ent.get("id", "")),
                name=str(ent.get("name", "")),
                description=str(ent.get("description", "")),
                source_file=str(ent.get("source", {}).get("file", "")),
            )
        )
    return entities


def _load_modules(state_root: Path) -> List[Module]:
    modules_dir = state_root / "graph" / "internal" / "modules"
    if not modules_dir.exists():
        return []

    modules: List[Module] = []
    for file_path in sorted(modules_dir.glob("*.yaml")):
        data = _safe_load_yaml(file_path)
        mod = data.get("module", {}) if isinstance(data, dict) else {}
        if not mod:
            continue
        modules.append(
            Module(
                id=str(mod.get("id", "")),
                name=str(mod.get("name", "")),
                path=str(mod.get("path", "")),
            )
        )
    return modules


def load_aidoc_state(state_root: Path) -> AidocState:
    """Load AI-DOC slices from a state directory."""
    return AidocState(
        endpoints=_load_endpoints(state_root),
        entities=_load_entities(state_root),
        modules=_load_modules(state_root),
    )


# -----------------------------
# Task decomposition & scoring
# -----------------------------


HTTP_METHODS = {"get", "post", "put", "delete", "patch", "options", "head"}


def _detect_http_method(tokens: Sequence[str]) -> Optional[str]:
    for tok in tokens:
        if tok in HTTP_METHODS:
            return tok.upper()
    return None


def _detect_domain_hint(tokens: Sequence[str]) -> Optional[str]:
    if any(tok in {"endpoint", "api", "route", "http"} for tok in tokens):
        return "api"
    if any(tok in {"entity", "model", "data"} for tok in tokens):
        return "data"
    if any(tok in {"module", "file", "component"} for tok in tokens):
        return "graph"
    return None


def _extract_path_hint(text: str) -> Optional[str]:
    match = re.search(r"/[a-zA-Z0-9_\\-\\/{}]+", text)
    return match.group(0) if match else None


def _collect_candidate_tokens(candidate: Candidate) -> List[str]:
    parts = [
        candidate.id,
        candidate.title,
        candidate.description,
        candidate.location or "",
        candidate.domain,
        candidate.type,
    ]
    tokens = []
    for part in parts:
        tokens.extend(_tokenize(part))
        tokens.extend(_path_tokens(part))
    return _unique(tokens)


def _score_candidate(
    task_tokens: List[str],
    method_hint: Optional[str],
    path_hint_tokens: List[str],
    domain_hint: Optional[str],
    candidate: Candidate,
) -> Tuple[float, str]:
    cand_tokens = _collect_candidate_tokens(candidate)
    token_overlap = len(set(task_tokens) & set(cand_tokens))
    overlap_score = token_overlap / max(len(task_tokens), 1)

    method_bonus = 0.0
    if method_hint and method_hint.lower() in [tok.lower() for tok in cand_tokens]:
        method_bonus = 0.4

    path_bonus = 0.0
    if path_hint_tokens:
        path_matches = len(set(path_hint_tokens) & set(cand_tokens))
        path_bonus = min(0.4, 0.1 * path_matches)

    domain_bonus = 0.0
    if domain_hint and candidate.domain == domain_hint:
        domain_bonus = 0.2

    score = round(overlap_score + method_bonus + path_bonus + domain_bonus, 4)
    rationale_bits = []
    if token_overlap:
        rationale_bits.append(f"{token_overlap} token match")
    if method_bonus:
        rationale_bits.append(f"HTTP method match ({method_hint})")
    if path_bonus:
        rationale_bits.append("path overlap")
    if domain_bonus:
        rationale_bits.append(f"domain hint ({domain_hint})")
    rationale = "; ".join(rationale_bits) if rationale_bits else "baseline match"
    return score, rationale


def _build_candidates(state: AidocState) -> List[Candidate]:
    candidates: List[Candidate] = []
    for ep in state.endpoints:
        title = f"{ep.method} {ep.path}".strip()
        desc = ep.summary or ep.domain_function
        candidates.append(
            Candidate(
                id=ep.id,
                domain="api",
                type="endpoint",
                title=title,
                description=desc,
                score=0.0,
                rationale="",
                location=ep.handler_file,
            )
        )
    for ent in state.entities:
        candidates.append(
            Candidate(
                id=ent.id,
                domain="data",
                type="entity",
                title=ent.name,
                description=ent.description,
                score=0.0,
                rationale="",
                location=ent.source_file,
            )
        )
    for mod in state.modules:
        candidates.append(
            Candidate(
                id=mod.id,
                domain="graph",
                type="module",
                title=mod.name,
                description=mod.path,
                score=0.0,
                rationale="",
                location=mod.path,
            )
        )
    return candidates


def analyze_task(task: str, state: AidocState, top_n: int = 5, threshold: float = 0.05) -> List[Candidate]:
    """Analyze a task and return ranked entry points."""
    task_tokens = _tokenize(task)
    method_hint = _detect_http_method(task_tokens)
    domain_hint = _detect_domain_hint(task_tokens)
    path_hint_raw = _extract_path_hint(task)
    path_hint_tokens = _path_tokens(path_hint_raw) if path_hint_raw else []

    candidates = _build_candidates(state)
    scored: List[Candidate] = []
    for cand in candidates:
        score, rationale = _score_candidate(task_tokens, method_hint, path_hint_tokens, domain_hint, cand)
        if score < threshold:
            continue
        scored.append(
            Candidate(
                **{**cand.__dict__, "score": score, "rationale": rationale},
            )
        )

    scored.sort(key=lambda c: (-c.score, c.id))
    return scored[:top_n]


# -----------------------------
# CLI helpers
# -----------------------------


def _format_table(candidates: Sequence[Candidate]) -> str:
    lines = ["score  domain/type       id                        title / desc"]
    for cand in candidates:
        dom_type = f"{cand.domain}/{cand.type}"
        title = f"{cand.title}"
        desc = f"{cand.description}" if cand.description else ""
        summary = title if not desc else f"{title} — {desc}"
        lines.append(f"{cand.score:0.3f}  {dom_type:<14}  {cand.id:<24}  {summary}")
    if not candidates:
        lines.append("(no candidates above threshold)")
    return "\n".join(lines)


def _cli(args: argparse.Namespace) -> int:
    state_root = Path(args.state).resolve()
    if args.demo:
        state_root = Path(__file__).parent / "examples" / "aidoc_sample" / ".ste" / "state"

    if not state_root.exists():
        print(f"AI-DOC state not found at: {state_root}", file=sys.stderr)
        return 2

    try:
        state = load_aidoc_state(state_root)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 3

    candidates = analyze_task(args.task, state, top_n=args.top, threshold=args.threshold)

    if args.format in ("table", "both"):
        print(_format_table(candidates))
    if args.format in ("json", "both"):
        print(json.dumps([cand.__dict__ for cand in candidates], indent=2))
    return 0


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze a task against AI-DOC entry points.")
    parser.add_argument("--task", required=True, help="Natural language task to analyze")
    parser.add_argument("--state", default=".ste/state", help="Path to AI-DOC state directory")
    parser.add_argument("--format", choices=["table", "json", "both"], default="table", help="Output format")
    parser.add_argument("--top", type=int, default=5, help="Max number of candidates to return")
    parser.add_argument("--threshold", type=float, default=0.05, help="Minimum score threshold")
    parser.add_argument("--demo", action="store_true", help="Use bundled sample AI-DOC for quick validation")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    return _cli(args)


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    sys.exit(main())



