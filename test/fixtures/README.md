# Fixture hosts

Three synthetic Next.js hosts, each with a design system that is genuinely NOT
this repository's. They exist so `host-agnostic-cases.mjs` can prove the editor
reads a host's tokens rather than a memory of the app it was written in.

| Fixture | Tailwind | Tokens arrive as | What it proves |
| --- | --- | --- | --- |
| `aurora-v4/` | v4 | Figma-style manifest + `@theme` | Renamed/extended `@theme` namespaces, `px` tracking, absent Spacing/icons/motion |
| `relay-v3/` | v3 | Figma-style manifest + `tailwind.config.js` | No `@theme` at all, five omitted token groups, literal-valued theme entries |
| `lattice-adapter/` | v4 | A JavaScript module, via `designSystem.adapter` | A host whose tokens were never a manifest |

None of them is a real product. Keep them small: a fixture that grows into a
second design system stops being readable as a counter-example.
