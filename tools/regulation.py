#!/usr/bin/env python3
"""Fed vs fasting: which hormonally controlled steps are ON or OFF in each state, and why.
   Writes a `reg` field on those reactions: {"fed": "on"|"off", "fasting": "on"|"off", "why": "…"}.
   Edit the table below and rerun (python3 tools/regulation.py); it only touches `reg`.
   Kept to the classic, high-yield switch points; a step that is merely "lower" in one state isn't listed."""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data' / 'pathways'
ON, OFF = 'on', 'off'
REG = {
    'glycolysis': {
        'r1': (ON, OFF, 'Liver glucokinase: insulin induces it; when fasting it is held in the nucleus (GKRP). Hexokinase in other tissues stays on.'),
        'r3': (ON, OFF, 'Insulin raises fructose-2,6-bisphosphate, which activates PFK-1; glucagon lowers it. ATP and citrate inhibit, AMP activates.'),
        'r10': (ON, OFF, 'Liver pyruvate kinase: insulin keeps it dephosphorylated (active); glucagon → PKA phosphorylates it (inactive). Fructose-1,6-bisphosphate feeds forward.'),
    },
    'gluconeogenesis': {
        'r1': (OFF, ON, 'Acetyl-CoA from fatty acid oxidation (fasting) activates pyruvate carboxylase.'),
        'r2': (OFF, ON, 'Glucagon and cortisol induce PEP carboxykinase; insulin represses it.'),
        'r9': (OFF, ON, 'Fructose-2,6-bisphosphate (high when fed, insulin) inhibits it; glucagon lowers F-2,6-BP. AMP inhibits too.'),
        'r11': (OFF, ON, 'Glucagon and cortisol induce glucose-6-phosphatase (liver, kidney); the last step before glucose leaves the cell.'),
    },
    'glycogen-synthesis': {
        'r3': (ON, OFF, 'Insulin → protein phosphatase 1 dephosphorylates (activates) it; glucose-6-phosphate activates. Glucagon/epinephrine → PKA phosphorylates (inactivates) it.'),
    },
    'glycogenolysis': {
        'r1': (OFF, ON, 'Glucagon (liver) and epinephrine (liver, muscle) → PKA → phosphorylase kinase activates it; insulin dephosphorylates it. In muscle, AMP and Ca²⁺ activate it too.'),
    },
    'tca': {
        'r0': (ON, OFF, 'Insulin activates PDH phosphatase (PDH on). When fasting, acetyl-CoA and NADH from fatty acid oxidation switch on PDH kinase (PDH off).'),
    },
    'fatty-acid-synthesis': {
        'r4': (ON, OFF, 'Insulin dephosphorylates (activates) acetyl-CoA carboxylase and citrate activates it; glucagon (PKA) and AMPK phosphorylate it, and palmitoyl-CoA inhibits.'),
        'r5': (ON, OFF, 'Insulin induces fatty acid synthase (SREBP-1c); fasting lowers it.'),
    },
    'beta-oxidation': {
        'r2': (OFF, ON, 'Malonyl-CoA (made by acetyl-CoA carboxylase when fed) inhibits CPT-I; fasting lets malonyl-CoA fall, so fatty acids enter the mitochondria.'),
    },
    'ketogenesis': {
        'r2': (OFF, ON, 'Glucagon induces mitochondrial HMG-CoA synthase, and acetyl-CoA builds up from fatty acid oxidation; insulin suppresses it.'),
    },
    'cholesterol-synthesis': {
        'r3': (ON, OFF, 'Insulin dephosphorylates (activates) HMG-CoA reductase; glucagon and AMPK phosphorylate (inactivate) it. Cholesterol itself represses it (SREBP-2).'),
    },
}

for pid, steps in REG.items():
    f = DATA / f'{pid}.json'
    p = json.loads(f.read_text())
    for r in p['reactions']:
        r.pop('reg', None)
        if r['id'] in steps:
            fed, fasting, why = steps[r['id']]
            r['reg'] = {'fed': fed, 'fasting': fasting, 'why': why}
    missing = set(steps) - {r['id'] for r in p['reactions']}
    assert not missing, f'{pid}: no step {missing}'
    f.write_text(json.dumps(p, indent=1, ensure_ascii=False) + '\n')
    print(f'{pid}: {len(steps)} step(s)')
