# Compiler authority (ste-runtime)

**ste-runtime produces runtime evidence and runtime-owned machine artifacts** in the STE toolchain. Public cross-repo schemas are owned by `ste-spec`, and caller-facing admission is owned by `ste-kernel`.

## Guardrails

- **Source of compilation:** Prefer compiling from **canonical ADR YAML** and **source code**. Do not treat another component's precompiled ADR graph or pre-generated registry bundle as the authority for "what the architecture is" long term.
- **Single public contract authority:** Avoid introducing a parallel public contract or schema authority in another language or package. `ste-spec` owns shared schemas; ste-runtime consumes them.
- **RECON boundary:** ADR extraction is a **separate** compiler stage from RECON. Do not fold ADR graph construction into RECON phases.

## Related

- **adr-architecture-kit** is the **authoring** system (schema, validation, human workflows). It is not the compiler of record for kernel/runtime machine artifacts. See `adr-architecture-kit/AUTHORING-SYSTEM.md`.
- **ste-kernel** consumes runtime evidence and emits admission decisions; it does not interpret raw ADR YAML as a replacement for public contracts.

## CLI: compile machine artifacts

From a project root that contains `PROJECT.yaml` and `adrs/`:

```bash
ste architecture compile --project-root .
```

Use `--dry-run` to validate the pipeline without writing files. Registries, `architecture-index.yaml`, `manifest.yaml`, and the legacy `adrs/entities/registry.yaml` are produced under `adrs/` by **ste-runtime**, not by `adr compile`.

