# Pathways

Study app for biochemical pathways. Python standard library only — no dependencies.

Two ways to run the same front end:

| | Where your edits and history live | How |
|---|---|---|
| **Self-hosted** | on the server (`data/user/state.json`), shared by every device | `python3 server.py` → http://localhost:8000 · deployed at https://pathways.chbarnhouse.com via `./deploy.sh` |
| **Standalone** | in that browser only (export/import to move pathways) | `python3 build.py` → `dist/pathways.html` (open anywhere) and `dist/pathways-artifact.html` (the shared claude.ai copy) |

## Studying
- **Modes** — Single blank · Full recall (random start, a chosen item, or the beginning with nothing shown; forward to the end, then backward; cycles go around) · Single step, given **two metabolites** (→ enzyme, cofactors, direction) or **the enzyme** (→ reactants, products, cofactors, pathway — drawn from all pathways)
- **Quiz setup** — each element (metabolites, enzymes, cofactors, direction, pathway) is set to Show, Quiz or Hide for the current mode
- **Answers** — Type (on the diagram in occlusion modes; case/space/punctuation-insensitive, accepts aliases, "phosphate" ≡ "P") · Choice (never mixes kinds) · Self-check. Reveal answer on Type and Choice.
- **Diagram** — Flow or List; zoom, Fit width, Fit to frame, and Follow (keeps the current blank centered)
- **Weak spots** — every answer is recorded per item; "Weak spots first" weights the deck toward misses

## Pathway files
`data/pathways/*.json`, one per pathway (the in-app editor writes the same shape):
- `metabolites` / `enzymes`: `{id: {name, short, aliases[], notes}}`
- `reactions` in order: `{id, enzyme, from, to, reversible, cofactors: {in[], out[]}, also_to[] (side products), also_from[] (side inputs), branch (side step), multiplier, loc, requires[], tags[]}`
- `circular`, `group`, `aliases` (other names for the pathway), `multiplier_label`, `distractors` (extra wrong answers for multiple choice), optional pathway-specific `cofactors`
- Shared cofactor ids: `data/cofactors.json`
