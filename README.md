# Step 1 Pathways

Study biochemical pathways for Step 1: fill the blanks on the diagram, rebuild whole pathways from memory, or drill single steps from either side.

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

## Keeping users' data safe across updates
Users' history, tags, favorites and edits live in their own browsers (or `data/user/state.json` on the server), so an update must never break or lose them. `node tools/test-data.js` checks that; `deploy.sh` and `release.sh` refuse to run if it fails.

- **Changing what gets saved** (a new field, a renamed field, a new shape): bump `SCHEMA` in `static/js/store.js` and add one step to `MIGRATIONS` that turns the previous format into the new one. Never edit a step that has shipped. Add a frozen sample of the old format to `tests/fixtures/` (copy a real backup) so it is tested forever.
- **Renaming or removing a built-in id** (a pathway, metabolite or reaction id; history and favorites hang on these): record it in `data/renames.json`, `{"old": "new"}`, or under `retired` if it is gone on purpose. The test lists any released id that vanished without a record. Names, notes and layout can change freely; only ids matter.
- **Safety nets:** before upgrading, the browser keeps the old data (`pathways.safety.v<N>`); the server keeps a copy per day (last 30) and one before each deploy (last 10) in `data/user/backups/`. Data saved by a newer version is never overwritten by an older page: it goes read-only and asks for a reload (the server refuses such writes with 409).
- Released ids are recorded in `tools/released-ids.json` by `release.sh`.

## Pathways shared by classmates
Classmates press **Share with classmates** on their own (or edited) pathway: the app downloads the `.json` and opens the sharing Google Form (set `SHARE_FORM` in `static/js/report.js`; the button is hidden until then). Submissions land in the sharing form's responses with the file in Drive. To approve one: give it an id `shared-<name>-<pathway>`, add `"shared": {"by": "<display name>", "on": "YYYY-MM-DD"}`, save it as `data/pathways/<id>.json`, run `node tools/validate.js`, add a changelog note, and release. It then appears for everyone under **Shared by classmates**. Once released, its ids are protected like any built-in. A suggested change to a built-in is applied to that built-in instead.

## Pathway files
`data/pathways/*.json`, one per pathway; `node tools/validate.js` checks them all.
- `metabolites` / `enzymes`: `{id: {name, short, aliases[], notes}}` (+ `pos: [col,row]` on metabolites in a grid)
- `reactions` in order: `{id, enzyme, from, to, reversible, cofactors: {in[], out[]}, also_to[], also_from[], branch, transport, loc, tissue, multiplier, requires[], tags[]}`
- pathway-level: `group`, `aliases`, `tissue`, `circular` or `layout: "grid"` (+ `grid_columns`), `multiplier_label`, `distractors`, `cofactors`
- combined pathways: `{id, name, compose: ["glycolysis", "gluconeogenesis"]}` — merged by name at load time
- shared cofactor ids: `data/cofactors.json`

Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0).
