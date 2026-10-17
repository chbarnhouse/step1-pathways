# Pathways

Self-hosted study app for biochemical pathways. Python standard library only — no dependencies.

```
python3 server.py            # http://localhost:8000  (PORT, HOST, PATHWAYS_DATA env vars)
```

## Study options
- **Modes** — Single blank (one metabolite or enzyme hidden) · Full recall (random start, forward to the end, then backward; cycles go around) · Single step (two metabolites → enzyme, cofactors, direction)
- **Views** — Flow (SVG process diagram) · List (top–bottom or left–right)
- **Answers** — Type (case/space/punctuation-insensitive, accepts aliases; "phosphate" ≡ "P") · Choice (metabolite and enzyme options never mixed) · Self-check
- **Quiz on** — Metabolites and/or Enzymes (stacking filters, occlusion modes)

## Adding a pathway
Drop a JSON file in `data/pathways/` (see `glycolysis.json`):
- `metabolites` / `enzymes`: `{id: {name, short, aliases[], notes}}`
- `reactions`: in pathway order — `{id, enzyme, from, to, reversible, cofactors: {in[], out[]}, also_to[] (side products), branch (side reaction feeding back in), multiplier, tags[]}`
- `circular: true` for cycles; `distractors` for multiple-choice confusers
- Cofactor ids come from `data/cofactors.json`.
