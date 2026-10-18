# STEP 1 Pathways

Study biochemical pathways for STEP 1: fill the blanks on the diagram, rebuild whole pathways from memory, or drill single steps from either side.

**Use it:** https://chbarnhouse.github.io/step1-pathways/ — nothing to install or sign into. Your progress, presets and any pathways you add stay in your own browser (Settings → Export backup to move them).

## What's in it
- **20 pathways**: glycolysis, gluconeogenesis (and the two combined), TCA, urea cycle, pentose phosphate, glycogen synthesis and breakdown, fatty acid synthesis, β-oxidation, ketogenesis, cholesterol, steroidogenesis, heme, catecholamines, purine and pyrimidine synthesis, galactose, fructose, polyol.
- **Quiz styles**: fill the blanks · full recall (from the top, a random point, or any step) · name the enzyme from two metabolites · given an enzyme, name its reactants, products, cofactors, location and pathway · cofactor drill · direction. Every element (metabolites, enzymes, transporters, cofactors, locations, direction, pathway) can be shown, quizzed or hidden.
- **Answers**: type into the diagram · type along (the answer is shown faintly; type it to fill it in) · multiple choice · self-check. Typing ignores case, spaces and punctuation, takes abbreviations, and accepts a/alpha for α, b/beta for β, and so on.
- **Weak spots**: every answer is tracked; drill the ones you miss most.
- **Editor**: add or change pathways (line, cycle or grid layouts; side steps, transporters, compartments and tissues), combine pathways, and share them as JSON.

## Running your own copy
Two ways to run the same app:

| | Where data lives | How |
|---|---|---|
| **Static** | each browser | `python3 build.py` → `docs/index.html` (GitHub Pages) and `dist/pathways.html` (one file, open anywhere) |
| **Self-hosted** | on the server, shared by every device | `python3 server.py` → http://localhost:8000. Python standard library only. `./deploy.sh` installs it on a Proxmox container (configure `deploy.env`, see `deploy.env.example`). |

## Working on changes vs. releasing them
Classmates use GitHub Pages, which serves `docs/` from **main**. Main only moves when you release, so day-to-day work never reaches them.

- **Work on `dev`.** Commit, push (`git push github dev`), and `./deploy.sh` to try it on your own copy. Add a line per user-visible change to the `{ v: 'next', items: [...] }` entry at the top of `CHANGELOG` in `static/js/version.js` (create it if it's missing). While that entry has notes, your copy shows a **Preview** badge listing them.
- **Release when a round is ready:** `./release.sh` (or `./release.sh patch`). It stamps the notes with the next version and today's date, validates, builds `docs/`, commits and tags on dev, fast-forwards main, pushes, and redeploys your copy. Returning visitors see the notes once as "What's new".
- `python3 build.py` refuses to build while there are unreleased notes, so a preview can't reach `docs/` by accident (`--preview` builds a local test file anyway).

## Pathway files
`data/pathways/*.json`, one per pathway; `node tools/validate.js` checks them all.
- `metabolites` / `enzymes`: `{id: {name, short, aliases[], notes}}` (+ `pos: [col,row]` on metabolites in a grid)
- `reactions` in order: `{id, enzyme, from, to, reversible, cofactors: {in[], out[]}, also_to[], also_from[], branch, transport, loc, tissue, multiplier, requires[], tags[]}`
- pathway-level: `group`, `aliases`, `tissue`, `circular` or `layout: "grid"` (+ `grid_columns`), `multiplier_label`, `distractors`, `cofactors`
- combined pathways: `{id, name, compose: ["glycolysis", "gluconeogenesis"]}` — merged by name at load time
- shared cofactor ids: `data/cofactors.json`

Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0).
