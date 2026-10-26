#!/usr/bin/env python3
"""Drugs and toxins: which step each one acts on, and how. Writes a `drugs` list on those reactions:
   [{"name", "kind": "drug"|"toxin", "effect": "inhibits"|"activates", "note", "aliases": [...]}].
   Edit the table and rerun (python3 tools/drugs.py); it only touches `drugs`.
   Keyed by pathway and step id (see the pathway's reactions); kept to classic, high-yield targets."""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data' / 'pathways'
D, T, INH, ACT = 'drug', 'toxin', 'inhibits', 'activates'
# (pathway, [step ids], name, kind, effect, note, aliases)
TABLE = [
    ('folate', ['r3'], 'Methotrexate', D, INH, 'Folate antagonist (human DHFR): cancers, rheumatoid arthritis, psoriasis, ectopic pregnancy. Leucovorin (folinic acid) rescues normal cells.', ['MTX']),
    ('folate', ['r3'], 'Trimethoprim', D, INH, 'Bacterial DHFR, far more than human; given with sulfamethoxazole (TMP-SMX).', ['TMP']),
    ('folate', ['r3'], 'Pyrimethamine', D, INH, 'Protozoal DHFR: toxoplasmosis (with sulfadiazine), malaria.', []),
    ('folate', ['r2'], '5-Fluorouracil', D, INH, 'Becomes 5-FdUMP, which locks thymidylate synthase with methylene-THF: no dTMP ("thymineless death"). Leucovorin strengthens it.', ['5-FU', 'fluorouracil', 'capecitabine']),
    ('pyrimidine-synthesis', ['r11'], '5-Fluorouracil', D, INH, 'Becomes 5-FdUMP, which locks thymidylate synthase: no dTMP.', ['5-FU', 'fluorouracil', 'capecitabine']),
    ('pyrimidine-synthesis', ['r4'], 'Leflunomide', D, INH, 'Blocks dihydroorotate dehydrogenase: rheumatoid arthritis, psoriatic arthritis (teriflunomide: MS).', ['teriflunomide']),
    ('pyrimidine-synthesis', ['r8'], 'Hydroxyurea', D, INH, 'Blocks ribonucleotide reductase: sickle cell disease (raises HbF), CML, polycythemia vera.', ['hydroxycarbamide']),
    ('purine-synthesis', ['r2'], '6-Mercaptopurine', D, INH, 'Purine analog (azathioprine is its prodrug) that shuts down de novo purine synthesis at PRPP amidotransferase. Broken down by xanthine oxidase (so allopurinol raises it) and TPMT.', ['6-MP', 'azathioprine', 'mercaptopurine']),
    ('purine-synthesis', ['r14'], 'Mycophenolate', D, INH, 'Blocks IMP dehydrogenase, so lymphocytes run out of GMP: transplant rejection, lupus nephritis.', ['mycophenolate mofetil', 'MMF', 'mycophenolic acid']),
    ('purine-synthesis', ['r14'], 'Ribavirin', D, INH, 'Blocks IMP dehydrogenase (depletes GTP): RSV, hepatitis C. Hemolytic anemia; teratogen.', []),
    ('purine-salvage', ['r4', 'r5'], 'Allopurinol', D, INH, 'Blocks xanthine oxidase: gout, prevents tumor lysis syndrome. Raises azathioprine and 6-MP levels.', []),
    ('purine-salvage', ['r4', 'r5'], 'Febuxostat', D, INH, 'Blocks xanthine oxidase (not a purine analog): gout.', []),
    ('cholesterol-synthesis', ['r3'], 'Statins', D, INH, 'Block HMG-CoA reductase, so liver cells make more LDL receptors and LDL falls. Myopathy, raised liver enzymes.', ['statin', 'atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin']),
    ('cholesterol-synthesis', ['r13'], 'Azole antifungals', D, INH, 'Block fungal lanosterol 14α-demethylase (CYP51), so no ergosterol; ketoconazole also blocks human steroid synthesis.', ['azoles', 'ketoconazole', 'fluconazole', 'itraconazole', 'voriconazole']),
    ('catecholamines', ['r2'], 'Metyrosine', D, INH, 'Blocks tyrosine hydroxylase: pheochromocytoma (before surgery, or when it can’t be removed).', ['α-methyltyrosine', 'alpha-methyltyrosine']),
    ('catecholamines', ['r3'], 'Carbidopa', D, INH, 'Blocks DOPA decarboxylase outside the brain, so more levodopa reaches it and fewer peripheral side effects (Parkinson disease).', ['benserazide']),
    ('catecholamines', ['r6'], 'Reserpine', D, INH, 'Blocks VMAT, so monoamines aren’t stored and get broken down: hypertension (old); depression is a side effect.', []),
    ('catecholamines', ['r6'], 'Tetrabenazine', D, INH, 'Blocks VMAT2: Huntington chorea, tardive dyskinesia (deutetrabenazine, valbenazine likewise).', ['deutetrabenazine', 'valbenazine']),
    ('tca', ['r0', 'r4'], 'Arsenic', T, INH, 'Binds lipoic acid, so pyruvate dehydrogenase and α-ketoglutarate dehydrogenase stop: vomiting, rice-water stools, garlic breath, QT prolongation.', ['arsenite']),
    ('tca', ['r2'], 'Fluoroacetate', T, INH, 'Rat poison: becomes fluorocitrate, which blocks aconitase.', ['fluorocitrate', 'sodium fluoroacetate']),
    ('glycolysis', ['r6'], 'Arsenate', T, INH, 'Takes phosphate’s place at GAPDH: no 1,3-bisphosphoglycerate, so glycolysis runs but makes no ATP at the next step.', []),
    ('glycolysis', ['r9'], 'Fluoride', T, INH, 'Blocks enolase: why blood-glucose tubes contain sodium fluoride (cells stop using up the glucose).', ['sodium fluoride']),
    ('heme', ['r2', 'r8'], 'Lead', T, INH, 'Blocks ALA dehydratase and ferrochelatase: microcytic anemia with basophilic stippling; ALA and protoporphyrin build up.', ['lead poisoning']),
    ('heme', ['r1'], 'Hemin', D, INH, 'Represses ALA synthase (as does glucose): acute porphyria attacks.', ['heme arginate', 'panhematin']),
    ('bilirubin', ['r4'], 'Phenobarbital', D, ACT, 'Induces UGT1A1: lowers unconjugated bilirubin in Crigler–Najjar type II (not type I).', []),
    ('bilirubin', ['r4'], 'Atazanavir', D, INH, 'Inhibits UGT1A1: harmless unconjugated hyperbilirubinemia (indinavir too).', ['indinavir']),
    ('steroidogenesis', ['r2'], 'Ketoconazole', D, INH, 'Blocks desmolase (and 17,20-lyase): Cushing syndrome; also an antifungal.', []),
    ('steroidogenesis', ['r3', 'r8', 'r4', 'r9'], 'Abiraterone', D, INH, 'Blocks CYP17 (17α-hydroxylase and 17,20-lyase), so no androgens from the adrenals: metastatic prostate cancer (given with prednisone).', []),
    ('steroidogenesis', ['r12', 'r13'], 'Metyrapone', D, INH, 'Blocks 11β-hydroxylase: Cushing syndrome; the metyrapone test of ACTH reserve.', []),
    ('steroidogenesis', ['r18'], 'Finasteride', D, INH, 'Blocks 5α-reductase (type 2), so less DHT: BPH, male-pattern hair loss (dutasteride blocks types 1 and 2).', ['dutasteride']),
    ('steroidogenesis', ['r16', 'r17'], 'Aromatase inhibitors', D, INH, 'Anastrozole, letrozole, exemestane: ER-positive breast cancer after menopause.', ['anastrozole', 'letrozole', 'exemestane']),
    ('steroidogenesis', ['r19'], 'Licorice', T, INH, 'Glycyrrhetinic acid blocks 11β-HSD2, so cortisol acts on mineralocorticoid receptors: hypertension, hypokalemia (apparent mineralocorticoid excess).', ['glycyrrhetinic acid', 'glycyrrhizin']),
    ('eicosanoids', ['r1'], 'Glucocorticoids', D, INH, 'Block phospholipase A₂ (via annexin A1) and cut COX-2 production: every eicosanoid falls.', ['corticosteroids', 'prednisone', 'dexamethasone']),
    ('eicosanoids', ['r8'], 'Aspirin', D, INH, 'Irreversibly acetylates COX-1 and COX-2: platelets (no nucleus) lose thromboxane for their whole life.', ['acetylsalicylic acid', 'ASA']),
    ('eicosanoids', ['r8'], 'NSAIDs', D, INH, 'Reversibly block COX-1 and COX-2: ibuprofen, naproxen, indomethacin (closes a PDA).', ['ibuprofen', 'naproxen', 'indomethacin', 'ketorolac', 'diclofenac']),
    ('eicosanoids', ['r8'], 'Celecoxib', D, INH, 'Blocks COX-2 only: spares the stomach and platelets; raises thrombosis risk.', ['COX-2 inhibitor']),
    ('eicosanoids', ['r2', 'r3'], 'Zileuton', D, INH, 'Blocks 5-lipoxygenase, so no leukotrienes: asthma.', []),
    ('beta-oxidation', ['r4'], 'Hypoglycin A', T, INH, 'From unripe ackee fruit: blocks acyl-CoA dehydrogenase, so severe hypoglycemia (Jamaican vomiting sickness).', ['hypoglycin', 'ackee']),
    ('coagulation', ['r7'], 'Direct factor Xa inhibitors', D, INH, 'Rivaroxaban, apixaban, edoxaban: block factor Xa in the prothrombinase.', ['rivaroxaban', 'apixaban', 'edoxaban', 'factor Xa inhibitors']),
    ('coagulation', ['r7', 'r8'], 'Heparin', D, INH, 'Activates antithrombin, which shuts down factor Xa and thrombin (LMWH acts mostly on Xa).', ['unfractionated heparin', 'UFH', 'enoxaparin', 'LMWH']),
    ('coagulation', ['r8'], 'Direct thrombin inhibitors', D, INH, 'Dabigatran (oral), argatroban and bivalirudin (IV): block thrombin.', ['dabigatran', 'argatroban', 'bivalirudin']),
    ('coagulation', ['r14'], 'Alteplase', D, ACT, 'Recombinant tPA: turns plasminogen into plasmin to dissolve clots (stroke, MI, PE).', ['tPA', 'tenecteplase', 'reteplase', 'thrombolytics']),
    ('coagulation', ['r14'], 'Tranexamic acid', D, INH, 'Stops plasminogen activation (blocks its lysine binding sites): bleeding, heavy menstrual bleeding.', ['TXA', 'aminocaproic acid']),
    ('complement', ['r8', 'r9'], 'Eculizumab', D, INH, 'Antibody against C5: no C5 cleavage, no MAC. PNH, atypical HUS; vaccinate against Neisseria first.', ['ravulizumab']),
    ('nephron-pct', ['r9'], 'SGLT2 inhibitors', D, INH, 'The -gliflozins: glucose stays in the urine. Type 2 diabetes, heart failure, CKD; genital infections, euglycemic DKA.', ['empagliflozin', 'dapagliflozin', 'canagliflozin', 'gliflozins']),
    ('nephron-pct', ['r5', 'r7'], 'Acetazolamide', D, INH, 'Blocks carbonic anhydrase, so bicarbonate is lost in the urine: glaucoma, altitude sickness, IIH; hyperchloremic metabolic acidosis.', ['carbonic anhydrase inhibitors']),
    ('nephron-tal', ['r1', 'r3', 'r5'], 'Loop diuretics', D, INH, 'Block NKCC2: furosemide, bumetanide, torsemide, ethacrynic acid. Edema; hypokalemia, ototoxicity; they make you lose calcium.', ['furosemide', 'bumetanide', 'torsemide', 'ethacrynic acid']),
    ('nephron-dct', ['r1', 'r4'], 'Thiazides', D, INH, 'Block NCC: hydrochlorothiazide, chlorthalidone. Hypertension; hypokalemia, hypercalcemia, hyperglycemia, hyperuricemia.', ['hydrochlorothiazide', 'chlorthalidone', 'HCTZ', 'thiazide diuretics']),
    ('nephron-cd-principal', ['r1'], 'Amiloride', D, INH, 'Blocks ENaC (triamterene too): a potassium-sparing diuretic; Liddle syndrome, lithium-induced nephrogenic DI.', ['triamterene']),
    ('nephron-cd-principal', ['r5'], 'Vaptans', D, INH, 'Block the V2 receptor, so no aquaporin-2 in the membrane: SIADH, hyponatremia (tolvaptan, conivaptan).', ['tolvaptan', 'conivaptan', 'V2 antagonists']),
    ('nephron-cd-principal', ['r5'], 'Lithium', D, INH, 'Blunts ADH’s effect on aquaporin-2 insertion: nephrogenic diabetes insipidus (demeclocycline likewise).', ['demeclocycline']),
]

by = {}
for pid, rids, name, kind, effect, note, aliases in TABLE:
    for rid in rids:
        by.setdefault(pid, {}).setdefault(rid, []).append({'name': name, 'kind': kind, 'effect': effect, 'note': note, 'aliases': aliases})
for f in sorted(DATA.glob('*.json')):
    p = json.loads(f.read_text())
    steps = by.get(p['id'], {})
    had = any('drugs' in r for r in p.get('reactions', []))
    if not steps and not had:
        continue
    for r in p['reactions']:
        r.pop('drugs', None)
        if r['id'] in steps:
            r['drugs'] = steps[r['id']]
    missing = set(steps) - {r['id'] for r in p['reactions']}
    assert not missing, f"{p['id']}: no step {missing}"
    f.write_text(json.dumps(p, indent=1, ensure_ascii=False) + '\n')
    print(f"{p['id']}: {sum(len(v) for v in steps.values())} on {len(steps)} step(s)")
