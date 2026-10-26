#!/usr/bin/env python3
"""Where does it break? Classic deficiencies and the step that fails, with the clue an exam would give.
   Writes a `diseases` list on those reactions: [{"name", "clue"}]. Edit the table and rerun
   (python3 tools/diseases.py); it only touches `diseases`. One disease may sit on several steps (lead): any counts."""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data' / 'pathways'
# (pathway, [step ids], disease, clue)
TABLE = [
    ('glycolysis', ['r10'], 'Pyruvate kinase deficiency', 'Hemolytic anemia with echinocytes (burr cells) and raised 2,3-BPG, in a newborn.'),
    ('ppp', ['r1'], 'G6PD deficiency', 'Hemolysis with Heinz bodies and bite cells after fava beans, sulfa drugs, primaquine or infection; X-linked.'),
    ('glycogenolysis', ['r4'], 'Von Gierke disease (GSD I)', 'Severe fasting hypoglycemia, lactic acidosis, hyperuricemia, hypertriglyceridemia and a big liver and kidneys; glucagon does not raise glucose.'),
    ('glycogenolysis', ['r2'], 'Cori disease (GSD III)', 'Milder fasting hypoglycemia and hepatomegaly, normal lactate; limit dextrin–like structures pile up in the liver.'),
    ('glycogenolysis', ['r1'], 'McArdle disease (GSD V)', 'Painful cramps and myoglobinuria (red urine) with exercise, no rise in lactate; a “second wind” after a few minutes. (Hers disease is the liver form.)'),
    ('glycogen-synthesis', ['r4'], 'Andersen disease (GSD IV)', 'Failure to thrive and liver cirrhosis in infancy from abnormal, unbranched glycogen.'),
    ('galactose', ['r2'], 'Classic galactosemia', 'Infant vomiting, jaundice, hepatomegaly, cataracts and E. coli sepsis after starting breast milk; galactitol and galactose-1-phosphate build up.'),
    ('galactose', ['r1'], 'Galactokinase deficiency', 'Infantile cataracts (galactitol) in an otherwise well baby who has trouble tracking objects; galactose in blood and urine.'),
    ('fructose', ['r2'], 'Hereditary fructose intolerance', 'Hypoglycemia, vomiting, jaundice and liver damage after fruit, juice or honey; fructose-1-phosphate traps phosphate.'),
    ('fructose', ['r1'], 'Essential fructosuria', 'Fructose in the urine found by chance; no symptoms.'),
    ('tca', ['r0'], 'Pyruvate dehydrogenase deficiency', 'Lactic acidosis and neurologic defects in infancy, worse with carbohydrates; treat with a ketogenic diet (lysine and leucine).'),
    ('urea', ['r1'], 'OTC deficiency', 'Hyperammonemia (vomiting, lethargy, cerebral edema) with raised orotic acid in urine but no megaloblastic anemia; X-linked.'),
    ('urea', ['r2'], 'Citrullinemia', 'Hyperammonemia with very high blood citrulline.'),
    ('urea', ['r3'], 'Argininosuccinic aciduria', 'Hyperammonemia with argininosuccinate in the urine and brittle, tufted hair (trichorrhexis nodosa).'),
    ('urea', ['r4'], 'Arginase deficiency', 'Progressive spastic diplegia and growth delay; high arginine, often little hyperammonemia.'),
    ('pyrimidine-synthesis', ['r5', 'r6'], 'Orotic aciduria', 'Megaloblastic anemia that folate and B12 do not fix, failure to thrive, orotic acid in urine, normal ammonia; treat with uridine.'),
    ('purine-salvage', ['r9', 'r10'], 'Lesch–Nyhan syndrome', 'Self-mutilation (lip and finger biting), intellectual disability, dystonia and gout (orange “sand” in diapers); X-linked.'),
    ('purine-salvage', ['r2'], 'Adenosine deaminase deficiency', 'Severe combined immunodeficiency (SCID): recurrent infections from birth, no thymic shadow; dATP poisons lymphocytes.'),
    ('heme', ['r1'], 'X-linked sideroblastic anemia', 'Microcytic anemia with ringed sideroblasts and iron overload; may respond to B6 (pyridoxine).'),
    ('heme', ['r2', 'r8'], 'Lead poisoning', 'Microcytic anemia with basophilic stippling, abdominal colic, wrist or foot drop, lead lines on gums and bones; raised ALA and protoporphyrin.'),
    ('heme', ['r3'], 'Acute intermittent porphyria', 'Painful abdomen, port-wine urine, polyneuropathy and psychiatric symptoms, triggered by alcohol, fasting or drugs that induce CYP450; no photosensitivity.'),
    ('heme', ['r5'], 'Porphyria cutanea tarda', 'Blistering, fragile skin on sun-exposed hands, tea-colored urine; linked to hepatitis C and alcohol.'),
    ('bilirubin', ['r4'], 'Crigler–Najjar syndrome type I', 'Severe unconjugated hyperbilirubinemia and kernicterus in a newborn; phenobarbital does not help. (Gilbert syndrome: the same enzyme, mildly low; jaundice with fasting or stress.)'),
    ('steroidogenesis', ['r10', 'r11'], '21-Hydroxylase deficiency', 'Salt-wasting crisis (low Na⁺, high K⁺, hypotension) and ambiguous genitalia in a female newborn; raised 17-hydroxyprogesterone.'),
    ('steroidogenesis', ['r12', 'r13'], '11β-Hydroxylase deficiency', 'Virilization with hypertension and low potassium; raised 11-deoxycorticosterone and 11-deoxycortisol, low renin.'),
    ('steroidogenesis', ['r3', 'r8'], '17α-Hydroxylase deficiency', 'Hypertension and low potassium with no sex steroids: a phenotypic female with no puberty, or an XY person with female-appearing genitalia.'),
    ('steroidogenesis', ['r18'], '5α-Reductase deficiency', 'XY child with ambiguous or female-appearing genitalia who virilizes at puberty; normal testosterone, low DHT.'),
    ('beta-oxidation', ['r4'], 'MCAD deficiency', 'Hypoketotic hypoglycemia, vomiting and lethargy after fasting or illness in an infant; can cause sudden death. Avoid fasting.'),
    ('beta-oxidation', ['r2'], 'CPT-I deficiency', 'Hypoketotic hypoglycemia with hepatomegaly in fasting (liver form).'),
    ('beta-oxidation', ['r3'], 'CPT-II deficiency', 'Muscle pain, weakness and myoglobinuria after prolonged exercise or fasting; high acylcarnitines.'),
    ('cholesterol-synthesis', ['r14'], 'Smith–Lemli–Opitz syndrome', 'Microcephaly, syndactyly of toes 2–3, cleft palate, ambiguous genitalia and intellectual disability; high 7-dehydrocholesterol.'),
    ('catecholamines', ['r1'], 'Phenylketonuria', 'Intellectual disability, seizures, musty body odor, fair skin and eczema in an untreated child; avoid aspartame, supplement tyrosine.'),
    ('catecholamines', ['r4'], 'Dopamine β-hydroxylase deficiency', 'Severe orthostatic hypotension from birth, ptosis; no norepinephrine, high dopamine.'),
    ('methionine', ['r5'], 'Homocystinuria (cystathionine β-synthase)', 'Tall, marfanoid habitus with downward-and-inward lens dislocation, intellectual disability and blood clots; homocysteine in urine.'),
    ('methionine', ['r4'], 'Homocystinuria (methionine synthase / B12)', 'High homocysteine with low methionine; with B12 deficiency, megaloblastic anemia.'),
    ('folate', ['r4'], 'MTHFR deficiency', 'High homocysteine (raised clot risk) that improves with folate.'),
    ('propionyl-coa', ['r2'], 'Propionic acidemia', 'Infant with vomiting, poor feeding and lethargy, anion gap metabolic acidosis, hyperammonemia and hypoglycemia; no methylmalonic acid.'),
    ('propionyl-coa', ['r4'], 'Methylmalonic acidemia', 'Anion gap metabolic acidosis, vomiting and hyperammonemia in an infant, with methylmalonic acid in urine; B12 deficiency gives a milder version.'),
    ('sphingolipids', ['r5'], 'Gaucher disease', 'Hepatosplenomegaly, pancytopenia and bone pain or avascular necrosis; “crumpled tissue paper” macrophages. Most common lysosomal storage disease.'),
    ('sphingolipids', ['r2'], 'Tay–Sachs disease', 'Progressive neurodegeneration with an exaggerated startle and a cherry-red macula, but no hepatosplenomegaly; onion-skin lysosomes.'),
    ('sphingolipids', ['r6'], 'Sandhoff disease', 'Like Tay–Sachs (cherry-red macula, neurodegeneration) but with hepatosplenomegaly.'),
    ('sphingolipids', ['r10'], 'Niemann–Pick disease', 'Progressive neurodegeneration, hepatosplenomegaly, cherry-red macula and foam cells.'),
    ('sphingolipids', ['r7'], 'Fabry disease', 'Burning pain in hands and feet, angiokeratomas, hypohidrosis, then kidney and heart failure; X-linked.'),
    ('sphingolipids', ['r9'], 'Krabbe disease', 'Peripheral neuropathy, developmental delay and optic atrophy with globoid cells.'),
    ('sphingolipids', ['r8'], 'Metachromatic leukodystrophy', 'Central and peripheral demyelination: ataxia and dementia.'),
    ('nephron-tal', ['r1', 'r3', 'r5'], 'Bartter syndrome', 'Hypokalemic metabolic alkalosis with high urinary calcium in a child: looks like taking a loop diuretic.'),
    ('nephron-dct', ['r1', 'r4'], 'Gitelman syndrome', 'Hypokalemic metabolic alkalosis with low magnesium and low urinary calcium: looks like taking a thiazide.'),
    ('nephron-cd-principal', ['r1'], 'Liddle syndrome', 'Early hypertension, hypokalemia and metabolic alkalosis with low renin and low aldosterone (ENaC stuck open); treat with amiloride.'),
    ('nephron-cd-principal', ['r5'], 'Nephrogenic diabetes insipidus', 'Large volumes of dilute urine that desmopressin does not concentrate (V2 receptor or aquaporin-2 defect; lithium).'),
    ('nephron-cd-intercalated', ['r3'], 'Distal (type 1) renal tubular acidosis', 'Non-anion gap acidosis with urine pH above 5.5, hypokalemia and calcium phosphate kidney stones.'),
    ('nephron-pct', ['r5', 'r7', 'r8'], 'Proximal (type 2) renal tubular acidosis', 'Non-anion gap acidosis with hypokalemia; urine can still acidify (below 5.5) once serum bicarbonate falls; often with Fanconi syndrome.'),
    ('coagulation', ['r5'], 'Hemophilia A and B', 'Deep bleeding into joints and muscles in a boy; long PTT, normal PT and platelets (factor VIII in A, IX in B).'),
    ('complement', ['r10'], 'Terminal complement (C5–C9) deficiency', 'Recurrent Neisseria infections (meningococcus, gonococcus).'),
]

by = {}
for pid, rids, name, clue in TABLE:
    for rid in rids:
        by.setdefault(pid, {}).setdefault(rid, []).append({'name': name, 'clue': clue})
for f in sorted(DATA.glob('*.json')):
    p = json.loads(f.read_text())
    steps = by.get(p['id'], {})
    if not steps and not any('diseases' in r for r in p.get('reactions', [])):
        continue
    for r in p['reactions']:
        r.pop('diseases', None)
        if r['id'] in steps:
            r['diseases'] = steps[r['id']]
    missing = set(steps) - {r['id'] for r in p['reactions']}
    assert not missing, f"{p['id']}: no step {missing}"
    f.write_text(json.dumps(p, indent=1, ensure_ascii=False) + '\n')
    print(f"{p['id']}: {len({d['name'] for v in steps.values() for d in v})} disease(s)")
