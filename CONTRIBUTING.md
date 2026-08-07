# Contributing to Athena OS

Thank you for considering contributing to Athena. This document is about
**culture** — how Athena changes. For the mechanics (prerequisites, package
map, commands), read
[`docs/guides/development-environment.md`](docs/guides/development-environment.md).

Athena is a **cognitive execution platform with a protocol-defined reasoning
architecture**. The protocol is not folklore: it is written down, numbered,
and audited. Every change is accountable to it.

---

## Before you write any code, answer two questions

> 1. **Which RFC does this implement?**
> 2. **Does this introduce a new concept, or is it an implementation of an
>    existing concept?**
>    - **New concept** → stop. The architecture must change first: write an
>      RFC, have it reviewed, update the architecture — then implement.
>    - **Existing concept** → write code.

There is no third question. There is no "let's just try it and see."
If your idea does not implement an RFC, it is a concept, and concepts are
born as documents, not as code.

---

## The contribution workflow

```
Idea
  │
  ▼
Which RFC? — a concept must become an RFC before any code
  │
  ▼
Architecture review (only for new concepts: RFC + ADR)
  │
  ▼
Implementation — the smallest PR that proves the point
  │
  ▼
Conformance — the RFC's tests (examples, fixtures, exact equality)
  │
  ▼
Verification — build + lint + typecheck + test + architecture check
  │
  ▼
Commit — conventional, one commit one reason
```

---

## Repository tour — how Athena is read

```
README                          what Athena is
   ↓
ATHENA_MANIFESTO.md             why Athena exists
   ↓
ENGINEERING_PRINCIPLES.md       the rules of the house
   ↓
ROADMAP.md                      where Athena is going
   ↓
docs/rfcs/ RFC-0001 … RFC-0012  the protocol language
   ↓
docs/reference-implementations/ how the protocol is implemented
   ↓
docs/adr/ ADR-0000 … ADR-0005   why decisions were made
   ↓
packages/                        the code, organized by the dependency pyramid
```

**How to navigate Athena as a new contributor:**

1. Read `README.md`
2. Read `ATHENA_MANIFESTO.md`
3. Read `ENGINEERING_PRINCIPLES.md`
4. Read `ROADMAP.md`
5. Read `docs/rfcs/` in order — RFC-0005 (Intent Model) through RFC-0012
   (Reasoning Backend Contract)
6. Read `docs/reference-implementations/RFC-0011.md`
7. Read `docs/guides/development-environment.md`
8. Start coding

That sequence mirrors how Athena was built: philosophy → language →
implementation.

---

## Engineering rules you will be held to

- **One concept, one canonical definition, one owner.** Every shared concept
  lives in exactly one package. If a type already exists, import it from its
  owner — never re-define it locally. (`core` owns the protocol language;
  `reasoning` owns the reasoning contract; `reasoning-backends` implements
  backends.)
- **The validator is the authority.** A reasoning backend produces a
  *candidate*; the engine validates, simulates, and graphs it. No backend —
  deterministic or LLM — bypasses validation, and the engine never silently
  repairs a candidate.
- **Models are replaceable. Protocols are not.** Swapping a reasoning
  backend behind the contract is normal; changing the contract to fit a
  model is not.
- **Determinism and hermeticity.** Tests and the conformance suite run with
  no API keys and no network. The conformance oracle is exact
  deep-equality — "visually similar" is a failure.
- **One commit, one reason to exist.** A formatting commit exists because it
  normalizes formatting, not because it "also happened" during a feature —
  that keeps `git blame`, review, and bisect clean. No drive-by reformats;
  if you notice Prettier drift, log it, don't fold it into your PR.

---

## The commit

- Conventional commits, scoped to a package:
  `feat(reasoning): …`, `docs(development): …`, `fix(driver): …`.
- A PR states which RFC it implements and whether it changes the protocol or
  implements it.
- A PR is done when the gates pass:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:architecture
```

- Update the documentation that describes the change (RFC, README, module
  map); never land code without its documentation being true.
- Milestones, not releases: a milestone doc in `docs/milestones/`
  (`MILESTONE-N.md`) plus a `vX.Y.Z-alpha.N` tag earns a README/ROADMAP
  update — see `docs/guides/development-environment.md` §10.

## Pull requests

- Every PR needs review.
- Every gate must pass.
- Squash into one clean commit; the PR title should read as a commit message.
- Prefer the smallest PR that proves the architecture's claim. A PR that
  does many things is a PR that was not yet sure of one thing.

## Issues

- Search existing issues and RFCs before filing.
- Provide reproduction steps, device context (if device work), and what you
  expected versus what happened.
- If the issue implies a behavior the protocol does not describe, it belongs
  in an RFC discussion before it belongs in the tracker.