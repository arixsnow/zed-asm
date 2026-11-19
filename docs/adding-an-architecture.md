# Adding an architecture

A new architecture is a new grammar module ([grammar.md](grammar.md#modules)). The steps:

1. Write `tree-sitter/common/arch/<arch>.js` and register it in `MODULES` in `define-grammar.js`.
2. Add it to `ARCHS` in `scripts/lib/manifest.ts`. A test keeps that list equal to the files in
   `tree-sitter/common/arch/`.
3. Add a language to `languages.config.cjs`. If its comment rules differ, add an `ASM_DIALECT_*`
   block to `scanner.h`, include it in the count above the blocks, and add the name to `DIALECTS` in
   `scripts/lib/manifest.ts`.
4. Add `queries/<arch>/`, `test/corpus/<arch>/`, highlight cases in `test/highlight/cases.ts` and a
   fixture directory with its assemblers in `FIXTURE_DIALECTS` in `scripts/verify-fixtures.ts`.
5. Run `scripts/dev bun run generate`, `scripts/dev bun run test` and `scripts/zed`.
