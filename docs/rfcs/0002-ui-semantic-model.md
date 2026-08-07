# RFC 0002 — UI Semantic Model

## Status

Draft

## Proposed

v0.2.0-alpha.3 (UI Understanding engine)

## Problem

The planner must decide *what to do next* from what is on the screen. The raw
source of truth is WDA/Appium page-source XML: deeply nested
`XCUIElementType*` nodes with machine attributes. A planner fed raw XML would
be forced to learn iOS-internal element taxonomies, and the XML shape is an
implementation detail of the driver — not a stable contract.

## Objectives

1. The planner never sees XML. It sees a **semantic model**: elements with
   roles, labels, confidence, and provenance.
2. Every semantic element carries `confidence` and `source`
   (`Accessibility | Vision | OCR`) so the planner can trust what it reads.
3. The semantic model is driver-agnostic and lives in `packages/core` as a
   contract; the transformation lives in the `@athena-os/understanding`
   package ("the Understanding Engine").
4. Human-readable inspection of a screen (`athena tree` / `inspect`) works
   without dumping XML.

## Decision

- `SemanticElement`, `SemanticModel`, `SemanticRole`, `ElementConfidence`,
  `SemanticSummary` are defined in `packages/core/src/semantic.ts`.
- XML is parsed **only inside the driver** (`packages/driver/src/xml.ts`,
  using `fast-xml-parser`) into a neutral `UITree`.
- `buildSemanticModel(uiTree)` in `@athena-os/understanding` maps
  `XCUIElementType*` → semantic roles, derives labels, and scores confidence:
  - labeled + typed + positioned elements get the highest confidence
    (up to 0.99, source `Accessibility`);
  - bare structural nodes score lower;
  - Vision/OCR sources are future provenance slots, not yet wired.
- The executor's `getTree` action returns `{ model, tree }` in metadata and
  verifies the model has ≥1 element (`tree-has-nodes` strategy).
- The MCP `getTree` tool returns the model and a `rendered` human-readable
  tree; the CLI prints it (`tree`/`inspect` command, `--json` for the model).
- Every sprint ships a user-visible capability; this one ships screen
  inspection.

## Consequences

### Positive
- The planner boundary is now a clean semantic contract.
- Confidence + source make "can I trust this element?" an inspectable fact.
- `athena inspect` is a visible, useful capability independent of XML.

### Negative / Risks
- Role/confidence heuristics are first approximations; they will need
  calibration against real app screens.
- The `tree` metadata payload is larger than the old stub — size is bounded
  by screen complexity, acceptable for inspect commands.

### Follow-ups
- Vision / OCR engines as additional `SemanticSource`s, merged into the model.
- Element dedup/priority rules for overlapping or nested interactive elements.
- Confidence calibration against a corpus of real iPhone screens.

## Alternatives Considered
- **Planner reads XML directly** — rejected: couples the planner to driver
  internals and kills the trust model.
- **Semantic transform in the driver** — rejected: keeps the Understanding
  Engine fused with Appium instead of a distinct engine with its own tests.