# Loti MVP Handoff Package

This package is designed to be extracted directly into the root of the Loti GitHub repository.

It intentionally does **not** include a root `README.md`, so it will not overwrite the repository's existing README.

## Start here

For a coding agent:

1. read `AGENTS.md`;
2. execute `PROMPT_ONE_SHOT.md`;
3. treat `docs/` and the four PNG mockups as canonical references.

For a human reviewer:

- product context: `docs/00_CONTEXT.md`;
- product definition: `docs/01_PRODUCT.md`;
- design: `docs/06_DESIGN.md`;
- tech architecture: `docs/08_TECHNICAL_ARCHITECTURE.md`;
- plan: `docs/10_IMPLEMENTATION_PLAN.md`;
- final prompt: `PROMPT_ONE_SHOT.md`.

## Included visual references

Original approved PNGs are copied losslessly at their source resolution:

- Favorites Desktop: 1448×1086
- Favorites Mobile: 941×1672
- Purchase Desktop: 1448×1086
- Purchase Mobile: 941×1672

No resizing or lossy recompression was applied.

## Branding note

The mockup images still say **Importa** because the name **Loti** was chosen after mockup approval. The docs and final prompt explicitly require the implementation to use Loti.

## Legacy source

The original workbook is preserved under `legacy/source/` for the one-time migration script.
