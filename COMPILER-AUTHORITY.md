# Compiler authority (ste-runtime)

**ste-runtime is the compiler of record for all machine-consumable architecture state** in the STE toolchain: ADR intent (from ADR YAML), implementation structure (from RECON), unified merge, and projection to registries, architecture index, manifest, and runtime evidence shapes consumed by ste-kernel.

## Guardrails

- **Source of compilation:** Prefer compiling from **canonical ADR YAML** and **source code**. Do not treat another component’s precompiled ADR graph or pre-generated registry bundle as the authority for “what the architecture is” long term.
- **Single IR authority:** Avoid introducing a parallel architecture compiler in another language or package. During migration, legacy Python projection may exist for parity only; it must be removed once ste-runtime parity is proven.
- **RECON boundary:** ADR extraction is a **separate** compiler stage from RECON. Do not fold ADR graph construction into RECON phases.

## Related

- **adr-architecture-kit** is the **authoring** system (schema, validation, human workflows). It is not the compiler of record for kernel/runtime machine artifacts. See `adr-architecture-kit/AUTHORING-SYSTEM.md`.
- **ste-kernel** consumes **compiled evidence** only; it does not interpret raw ADR YAML.

## CLI: compile machine artifacts

From a project root that contains `PROJECT.yaml` and `adrs/`:

```bash
ste architecture compile --project-root .
```

Use `--dry-run` to validate the pipeline without writing files. Registries, `architecture-index.yaml`, `manifest.yaml`, and the legacy `adrs/entities/registry.yaml` are produced under `adrs/` by **ste-runtime**, not by `adr compile`.
