# Legacy Workbook Migration

## Source

A copy of the original workbook is included at:

`legacy/source/Favoritos_Hubbuy_original.xlsx`

This is migration input/reference, not an application runtime dependency.

## Goal

Import the useful current spreadsheet state once so the group can stop using the workbook immediately after launch.

Do **not** build a user-facing Excel import screen.

## Known workbook concepts

The workbook analysis identified structures equivalent to:

- Favoritos Gabriel;
- Favoritos Brunna;
- Presentes subsection;
- Próxima compra Set26;
- Compra Out26;
- SheinShoppee research items;
- Fornecedores Hubbuy;
- Build PC Novo.

Sheet/section names may contain formatting quirks. Inspect the workbook in the migration script rather than assuming only exact hardcoded cell ranges.

## Canonical mapping

### Favoritos Gabriel

→ favorites with `owner = Gabriel`.

### Favoritos Brunna

→ favorites with `owner = Brunna`.

### Presentes

→ Brunna-owned favorites in collection `Presentes`.

### Build PC Novo

→ Gabriel-owned favorites in collection `Build PC` (or `Build PC Novo` if preserving exact legacy label is preferable).

### SheinShoppee

→ favorites/research items owned according to source context and grouped in a collection such as `Pesquisar na HubBuy` only if that interpretation matches the actual data during script implementation. Preserve the original product URL/platform.

### Próxima compra Set26

→ finalized historical purchase for the corresponding month/year if it represents an already-completed round at migration time.

### Compra Out26

→ active purchase only if it is still the real next/current purchase when migration is executed; otherwise import as finalized history. Do not blindly force a stale workbook month to remain active.

### Fornecedores Hubbuy

Supplier management is not an MVP feature. Preserve useful source data only if it can map cleanly without inventing a new module; otherwise report it as intentionally not imported and keep the workbook as source archive.

## Field normalization

Legacy fields such as `Tipo`, `Variação/Modelo`, unlabeled variant columns and free text may all represent variation/model/notes. Preserve human information rather than over-normalizing destructively.

Price may be missing and must remain nullable.

Original URLs must be stored exactly for opening. Compute platform/canonical key independently.

## User mapping

The migration must map human labels (Gabriel, Brunna, Amanda, Bola, Vinicius) to actual Better Auth user IDs, preferably by configured email/name mapping supplied by the operator.

Do not hardcode production passwords or secret account data.

## Idempotency

The importer must be safe against accidental repeated execution.

Acceptable strategies include:

- deterministic legacy import keys;
- an import-run marker table;
- explicit legacy source IDs;
- another simple, documented strategy.

A second run must not duplicate favorites or purchase items.

## Dry-run/report

If practical, support a dry-run or summary mode reporting:

- favorites to create by owner;
- collections to create;
- purchases/items to import;
- rows skipped and why;
- unknown/unmapped rows.

## Validation after import

Report at least:

- count of favorites by user;
- count by collection;
- purchase item counts;
- totals by person for imported priced purchase items;
- rows with missing price;
- rows skipped/unmapped.

The migration should prefer transparency over silently guessing ambiguous source data.
