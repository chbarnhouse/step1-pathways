#!/usr/bin/env python3
"""Drugs and toxins: which step each one acts on, and how.
   Writes a `drugs` list on those reactions: [{"name", "kind": "drug"|"toxin", "effect": "inhibits"|"activates", "note",
   "aliases": [...], "cls": class name (drugs in a class)}], and data/drug-classes.json: {class: {"note", "show", "aliases"}}.
   Edit the tables and rerun (python3 tools/drugs.py); it only touches `drugs` and that file. Run it after nephron.py.

   One row per drug per pathway: the note says what it does there (lisinopril on the glomerulus is about GFR).
   A class holds what its members share; each member's note says what sets it apart. show: how a drawing names the class's
   members on a step: 'class' (one line, "⊣ Statins") when two or more act there, or 'members' (each its own line,
   when they differ in what they're for: methotrexate, trimethoprim, pyrimethamine)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'pathways'
D, T, INH, ACT = 'drug', 'toxin', 'inhibits', 'activates'

CLASSES = {
    'Antifolates': ('Block dihydrofolate reductase, so DHF isn’t recycled to THF: no new thymidine or purines. Which organism’s DHFR each one prefers decides what it treats.', 'members', ['DHFR inhibitors']),
    'Thymidylate synthase inhibitors': ('Fluoropyrimidines: 5-FdUMP locks thymidylate synthase with methylene-THF, so no dTMP ("thymineless death"). Leucovorin strengthens the lock; uridine triacetate is the antidote.', 'members', ['fluoropyrimidines']),
    'DHODH inhibitors': ('Block dihydroorotate dehydrogenase (de novo pyrimidine synthesis), which activated lymphocytes depend on. Hepatotoxic and teratogenic; washed out with cholestyramine.', 'members', ['dihydroorotate dehydrogenase inhibitors']),
    'Thiopurines': ('Purine analogs that shut down de novo purine synthesis at PRPP amidotransferase. Xanthine oxidase and TPMT break them down: allopurinol raises their levels, and low TPMT activity means bone-marrow suppression.', 'class', ['purine analogs']),
    'IMP dehydrogenase inhibitors': ('Block IMP dehydrogenase, so cells run short of GMP and GTP; lymphocytes, which rely on de novo purine synthesis, are hit hardest.', 'members', ['IMPDH inhibitors']),
    'Xanthine oxidase inhibitors': ('Block xanthine oxidase, so less uric acid: gout, and preventing tumor lysis syndrome. They raise azathioprine and 6-MP levels.', 'members', []),
    'Statins': ('Block HMG-CoA reductase, so liver cells make more LDL receptors and LDL falls. Myopathy (worse with fibrates and CYP3A4 inhibitors), raised liver enzymes.', 'class', ['HMG-CoA reductase inhibitors']),
    'Azole antifungals': ('Block fungal lanosterol 14α-demethylase (CYP51), so no ergosterol in the fungal membrane. They inhibit human CYP450s too (drug interactions).', 'class', ['azoles']),
    'DOPA decarboxylase inhibitors': ('Block DOPA decarboxylase outside the brain (they don’t cross the blood–brain barrier), so more levodopa reaches the brain with less nausea and hypotension.', 'members', ['peripheral decarboxylase inhibitors']),
    'VMAT inhibitors': ('Block the vesicular monoamine transporter, so monoamines aren’t packed into vesicles and are broken down instead.', 'members', ['VMAT2 inhibitors']),
    'HIV protease inhibitors': ('The -navirs. Atazanavir and indinavir also inhibit UGT1A1: a harmless unconjugated hyperbilirubinemia.', 'class', ['protease inhibitors']),
    '5α-Reductase inhibitors': ('Block 5α-reductase, so less testosterone becomes DHT: BPH, male-pattern hair loss. PSA falls by about half.', 'members', ['5-alpha-reductase inhibitors']),
    'Aromatase inhibitors': ('Block aromatase, so androgens aren’t turned into estrogens: ER-positive breast cancer after menopause. Bone loss, joint pain.', 'class', []),
    'Glucocorticoids': ('Block phospholipase A₂ (via annexin A1) and cut COX-2 production, so every eicosanoid falls; broadly anti-inflammatory and immunosuppressive.', 'class', ['corticosteroids', 'steroids']),
    'NSAIDs': ('Block cyclooxygenase (COX-1 and COX-2), so fewer prostaglandins and less thromboxane. Gastric ulcers, kidney injury (afferent arteriole), bleeding.', 'class', ['nonsteroidal anti-inflammatory drugs']),
    'Direct factor Xa inhibitors': ('The -xabans: block factor Xa directly, no antithrombin needed. Oral, no routine monitoring; andexanet alfa reverses them.', 'class', ['factor Xa inhibitors', 'xabans']),
    'Heparins': ('Activate antithrombin, which shuts down factor Xa (and, with unfractionated heparin, thrombin). Safe in pregnancy; heparin-induced thrombocytopenia.', 'members', []),
    'Direct thrombin inhibitors': ('Block thrombin directly, no antithrombin needed. Used when heparin can’t be (HIT).', 'members', ['DTIs']),
    'Thrombolytics': ('Turn plasminogen into plasmin, which dissolves fibrin clots: ischemic stroke, STEMI without PCI, massive PE. Bleeding; contraindicated after recent surgery or hemorrhagic stroke.', 'class', ['tPA', 'fibrinolytics']),
    'Antifibrinolytics': ('Block the lysine binding sites on plasminogen, so it can’t bind fibrin and be activated: bleeding, heavy menstrual bleeding, trauma.', 'class', []),
    'Complement C5 inhibitors': ('Antibodies against C5: no C5 cleavage, so no MAC. PNH, atypical HUS, myasthenia gravis. Vaccinate against Neisseria meningitidis first.', 'members', []),
    'SGLT2 inhibitors': ('The -gliflozins: block SGLT2 in the proximal tubule, so glucose (and sodium) stay in the urine. Type 2 diabetes, heart failure, CKD; genital infections, euglycemic DKA.', 'class', ['gliflozins']),
    'Loop diuretics': ('Block NKCC2 in the thick ascending limb, so the medullary gradient is lost: the strongest diuretics. Edema, hypercalcemia; hypokalemia, metabolic alkalosis, ototoxicity, and they make you lose calcium.', 'class', ['loops']),
    'Thiazides': ('Block NCC in the distal convoluted tubule. Hypertension, calcium kidney stones, nephrogenic DI; hypokalemia, hyponatremia, hypercalcemia, hyperglycemia, hyperuricemia.', 'class', ['thiazide diuretics']),
    'ENaC blockers': ('Potassium-sparing diuretics that block ENaC in the principal cell, so less sodium in and less potassium out. Hyperkalemia.', 'class', ['potassium-sparing diuretics']),
    'Vaptans': ('Block the V2 receptor, so no aquaporin-2 goes into the membrane and free water is lost: SIADH, euvolemic hyponatremia. Correct sodium slowly (osmotic demyelination).', 'class', ['V2 antagonists']),
    'ACE inhibitors': ('The -prils: block angiotensin-converting enzyme, so less angiotensin II and aldosterone. The efferent arteriole relaxes, so GFR falls a little (creatinine may rise up to about 30%) and the kidney is protected in diabetic nephropathy. Hyperkalemia; bradykinin builds up: dry cough, angioedema. Not in pregnancy or bilateral renal artery stenosis.', 'class', ['ACEIs', 'prils']),
    'ARBs': ('The -sartans: block the AT1 receptor. The same kidney effects as ACE inhibitors (efferent arteriole relaxes, GFR falls a little, hyperkalemia) without the bradykinin cough. Not in pregnancy.', 'class', ['angiotensin receptor blockers', 'sartans']),
}

NSAID_GFR = 'Blocks the prostaglandins that hold the afferent arteriole open, so GFR falls: acute kidney injury, especially with an ACE inhibitor or ARB and a diuretic (the "triple whammy").'

# (pathway, [step ids], name, kind, effect, note, aliases, class or None)
TABLE = [
    ('folate', ['r3'], 'Methotrexate', D, INH, 'Human DHFR: cancers, rheumatoid arthritis, psoriasis, ectopic pregnancy. Leucovorin (folinic acid) rescues normal cells.', ['MTX'], 'Antifolates'),
    ('folate', ['r3'], 'Trimethoprim', D, INH, 'Bacterial DHFR, far more than human; given with sulfamethoxazole (TMP-SMX). Hyperkalemia (blocks ENaC).', ['TMP'], 'Antifolates'),
    ('folate', ['r3'], 'Pyrimethamine', D, INH, 'Protozoal DHFR: toxoplasmosis (with sulfadiazine and leucovorin), malaria.', [], 'Antifolates'),
    ('folate', ['r2'], '5-Fluorouracil', D, INH, 'IV: colorectal, pancreatic and other GI cancers; topical for actinic keratosis. Myelosuppression, mucositis.', ['5-FU', 'fluorouracil'], 'Thymidylate synthase inhibitors'),
    ('folate', ['r2'], 'Capecitabine', D, INH, 'Oral prodrug of 5-FU: colorectal and breast cancer. Hand-foot syndrome.', [], 'Thymidylate synthase inhibitors'),
    ('pyrimidine-synthesis', ['r11'], '5-Fluorouracil', D, INH, 'IV: colorectal, pancreatic and other GI cancers; topical for actinic keratosis. Myelosuppression, mucositis.', ['5-FU', 'fluorouracil'], 'Thymidylate synthase inhibitors'),
    ('pyrimidine-synthesis', ['r11'], 'Capecitabine', D, INH, 'Oral prodrug of 5-FU: colorectal and breast cancer. Hand-foot syndrome.', [], 'Thymidylate synthase inhibitors'),
    ('pyrimidine-synthesis', ['r4'], 'Leflunomide', D, INH, 'Rheumatoid arthritis, psoriatic arthritis.', [], 'DHODH inhibitors'),
    ('pyrimidine-synthesis', ['r4'], 'Teriflunomide', D, INH, 'Leflunomide’s active metabolite: relapsing multiple sclerosis.', [], 'DHODH inhibitors'),
    ('pyrimidine-synthesis', ['r8'], 'Hydroxyurea', D, INH, 'Blocks ribonucleotide reductase: sickle cell disease (raises HbF), CML, polycythemia vera, essential thrombocythemia.', ['hydroxycarbamide'], None),
    ('purine-synthesis', ['r2'], '6-Mercaptopurine', D, INH, 'Acute lymphoblastic leukemia (maintenance), inflammatory bowel disease.', ['6-MP', 'mercaptopurine'], 'Thiopurines'),
    ('purine-synthesis', ['r2'], 'Azathioprine', D, INH, 'Prodrug of 6-MP: transplant rejection, autoimmune disease (lupus, IBD, autoimmune hepatitis).', ['AZA'], 'Thiopurines'),
    ('purine-synthesis', ['r14'], 'Mycophenolate', D, INH, 'Transplant rejection, lupus nephritis. GI upset, myelosuppression; teratogen.', ['mycophenolate mofetil', 'MMF', 'mycophenolic acid'], 'IMP dehydrogenase inhibitors'),
    ('purine-synthesis', ['r14'], 'Ribavirin', D, INH, 'Antiviral (depletes GTP): RSV, chronic hepatitis C. Hemolytic anemia; teratogen.', [], 'IMP dehydrogenase inhibitors'),
    ('purine-salvage', ['r4', 'r5'], 'Allopurinol', D, INH, 'A purine analog (becomes oxypurinol): gout, tumor lysis prevention. Rash, rarely SJS/DRESS (HLA-B*58:01).', [], 'Xanthine oxidase inhibitors'),
    ('purine-salvage', ['r4', 'r5'], 'Febuxostat', D, INH, 'Not a purine analog: gout when allopurinol can’t be used. Raised cardiovascular death in one trial.', [], 'Xanthine oxidase inhibitors'),
    ('cholesterol-synthesis', ['r3'], 'Atorvastatin', D, INH, 'High-intensity at 40–80 mg; metabolized by CYP3A4.', [], 'Statins'),
    ('cholesterol-synthesis', ['r3'], 'Rosuvastatin', D, INH, 'The most potent (high-intensity at 20–40 mg); few CYP interactions.', [], 'Statins'),
    ('cholesterol-synthesis', ['r3'], 'Simvastatin', D, INH, 'CYP3A4: macrolides, azoles, protease inhibitors and grapefruit raise its levels and the myopathy risk.', [], 'Statins'),
    ('cholesterol-synthesis', ['r3'], 'Pravastatin', D, INH, 'Water-soluble and not a CYP3A4 substrate: the fewest drug interactions.', [], 'Statins'),
    ('cholesterol-synthesis', ['r3'], 'Lovastatin', D, INH, 'The first statin (from a fungus); CYP3A4.', [], 'Statins'),
    ('cholesterol-synthesis', ['r13'], 'Ketoconazole', D, INH, 'Rarely used as an antifungal now (liver toxicity); also blocks human steroid synthesis: gynecomastia, Cushing syndrome treatment.', [], 'Azole antifungals'),
    ('cholesterol-synthesis', ['r13'], 'Fluconazole', D, INH, 'Gets into the CSF: cryptococcal meningitis (maintenance), Candida infections.', [], 'Azole antifungals'),
    ('cholesterol-synthesis', ['r13'], 'Itraconazole', D, INH, 'Dimorphic fungi (histoplasmosis, blastomycosis), sporotrichosis. Avoid in heart failure.', [], 'Azole antifungals'),
    ('cholesterol-synthesis', ['r13'], 'Voriconazole', D, INH, 'Invasive aspergillosis. Visual disturbances, photosensitivity, hallucinations.', [], 'Azole antifungals'),
    ('catecholamines', ['r2'], 'Metyrosine', D, INH, 'Blocks tyrosine hydroxylase: pheochromocytoma (before surgery, or when it can’t be removed).', ['α-methyltyrosine', 'alpha-methyltyrosine'], None),
    ('catecholamines', ['r3'], 'Carbidopa', D, INH, 'Given with levodopa (Parkinson disease).', [], 'DOPA decarboxylase inhibitors'),
    ('catecholamines', ['r3'], 'Benserazide', D, INH, 'Carbidopa’s counterpart outside the US, with levodopa.', [], 'DOPA decarboxylase inhibitors'),
    ('catecholamines', ['r6'], 'Reserpine', D, INH, 'Irreversibly blocks VMAT1 and VMAT2: hypertension (old); depression is a side effect.', [], 'VMAT inhibitors'),
    ('catecholamines', ['r6'], 'Tetrabenazine', D, INH, 'Reversibly blocks VMAT2: Huntington chorea. Depression, suicidality.', [], 'VMAT inhibitors'),
    ('catecholamines', ['r6'], 'Deutetrabenazine', D, INH, 'Longer-acting VMAT2 blocker: Huntington chorea, tardive dyskinesia.', [], 'VMAT inhibitors'),
    ('catecholamines', ['r6'], 'Valbenazine', D, INH, 'VMAT2 blocker for tardive dyskinesia.', [], 'VMAT inhibitors'),
    ('tca', ['r0', 'r4'], 'Arsenic', T, INH, 'Binds lipoic acid, so pyruvate dehydrogenase and α-ketoglutarate dehydrogenase stop: vomiting, rice-water stools, garlic breath, QT prolongation.', ['arsenite'], None),
    ('tca', ['r2'], 'Fluoroacetate', T, INH, 'Rat poison: becomes fluorocitrate, which blocks aconitase.', ['fluorocitrate', 'sodium fluoroacetate'], None),
    ('glycolysis', ['r6'], 'Arsenate', T, INH, 'Takes phosphate’s place at GAPDH: no 1,3-bisphosphoglycerate, so glycolysis runs but makes no ATP at the next step.', [], None),
    ('glycolysis', ['r9'], 'Fluoride', T, INH, 'Blocks enolase: why blood-glucose tubes contain sodium fluoride (cells stop using up the glucose).', ['sodium fluoride'], None),
    ('heme', ['r2', 'r8'], 'Lead', T, INH, 'Blocks ALA dehydratase and ferrochelatase: microcytic anemia with basophilic stippling; ALA and protoporphyrin build up.', ['lead poisoning'], None),
    ('heme', ['r1'], 'Hemin', D, INH, 'Represses ALA synthase (as does glucose): acute porphyria attacks.', ['heme arginate', 'panhematin'], None),
    ('bilirubin', ['r4'], 'Phenobarbital', D, ACT, 'Induces UGT1A1: lowers unconjugated bilirubin in Crigler–Najjar type II (not type I).', [], None),
    ('bilirubin', ['r4'], 'Atazanavir', D, INH, 'HIV (boosted with ritonavir or cobicistat). Inhibits UGT1A1: harmless jaundice; kidney stones.', [], 'HIV protease inhibitors'),
    ('bilirubin', ['r4'], 'Indinavir', D, INH, 'HIV (old). Inhibits UGT1A1; crystal nephropathy and kidney stones (drink water).', [], 'HIV protease inhibitors'),
    ('steroidogenesis', ['r2'], 'Ketoconazole', D, INH, 'Blocks desmolase (and 17,20-lyase): Cushing syndrome; gynecomastia as a side effect.', [], 'Azole antifungals'),
    ('steroidogenesis', ['r3', 'r8', 'r4', 'r9'], 'Abiraterone', D, INH, 'Blocks CYP17 (17α-hydroxylase and 17,20-lyase), so no androgens from the adrenals: metastatic prostate cancer (given with prednisone).', [], None),
    ('steroidogenesis', ['r12', 'r13'], 'Metyrapone', D, INH, 'Blocks 11β-hydroxylase: Cushing syndrome; the metyrapone test of ACTH reserve.', [], None),
    ('steroidogenesis', ['r18'], 'Finasteride', D, INH, 'Type 2 only: BPH, male-pattern hair loss.', [], '5α-Reductase inhibitors'),
    ('steroidogenesis', ['r18'], 'Dutasteride', D, INH, 'Types 1 and 2: BPH.', [], '5α-Reductase inhibitors'),
    ('steroidogenesis', ['r16', 'r17'], 'Anastrozole', D, INH, 'Nonsteroidal, reversible.', [], 'Aromatase inhibitors'),
    ('steroidogenesis', ['r16', 'r17'], 'Letrozole', D, INH, 'Nonsteroidal, reversible; also induces ovulation (PCOS).', [], 'Aromatase inhibitors'),
    ('steroidogenesis', ['r16', 'r17'], 'Exemestane', D, INH, 'Steroidal: binds aromatase irreversibly.', [], 'Aromatase inhibitors'),
    ('steroidogenesis', ['r19'], 'Licorice', T, INH, 'Glycyrrhetinic acid blocks 11β-HSD2, so cortisol acts on mineralocorticoid receptors: hypertension, hypokalemia (apparent mineralocorticoid excess).', ['glycyrrhetinic acid', 'glycyrrhizin'], None),
    ('eicosanoids', ['r1'], 'Prednisone', D, INH, 'Oral; a prodrug the liver turns into prednisolone. The everyday steroid for flares.', ['prednisolone'], 'Glucocorticoids'),
    ('eicosanoids', ['r1'], 'Dexamethasone', D, INH, 'Long-acting, no mineralocorticoid effect: cerebral edema, croup, the dexamethasone suppression test.', [], 'Glucocorticoids'),
    ('eicosanoids', ['r1'], 'Hydrocortisone', D, INH, 'The same molecule as cortisol, with mineralocorticoid effect: adrenal insufficiency.', ['cortisol'], 'Glucocorticoids'),
    ('eicosanoids', ['r1'], 'Methylprednisolone', D, INH, 'IV pulses: MS relapses, transplant rejection, severe flares.', [], 'Glucocorticoids'),
    ('eicosanoids', ['r8'], 'Aspirin', D, INH, 'Irreversibly acetylates COX-1 and COX-2: platelets (no nucleus) lose thromboxane for their whole life. Reye syndrome in children; salicylate toxicity (tinnitus, mixed respiratory alkalosis and metabolic acidosis).', ['acetylsalicylic acid', 'ASA'], 'NSAIDs'),
    ('eicosanoids', ['r8'], 'Ibuprofen', D, INH, 'Reversible, short-acting.', [], 'NSAIDs'),
    ('eicosanoids', ['r8'], 'Naproxen', D, INH, 'Reversible, longer-acting (twice daily).', [], 'NSAIDs'),
    ('eicosanoids', ['r8'], 'Indomethacin', D, INH, 'Closes a patent ductus arteriosus; acute gout.', [], 'NSAIDs'),
    ('eicosanoids', ['r8'], 'Ketorolac', D, INH, 'IV or IM, for short-term moderate to severe pain.', [], 'NSAIDs'),
    ('eicosanoids', ['r8'], 'Celecoxib', D, INH, 'COX-2 only: spares the stomach lining and platelets; raises thrombosis risk. A sulfonamide.', ['COX-2 inhibitor'], 'NSAIDs'),
    ('eicosanoids', ['r2', 'r3'], 'Zileuton', D, INH, 'Blocks 5-lipoxygenase, so no leukotrienes: asthma. Hepatotoxic.', [], None),
    ('beta-oxidation', ['r4'], 'Hypoglycin A', T, INH, 'From unripe ackee fruit: blocks acyl-CoA dehydrogenase, so severe hypoglycemia (Jamaican vomiting sickness).', ['hypoglycin', 'ackee'], None),
    ('coagulation', ['r7'], 'Rivaroxaban', D, INH, 'Once daily, with food.', [], 'Direct factor Xa inhibitors'),
    ('coagulation', ['r7'], 'Apixaban', D, INH, 'Twice daily; the least bleeding of the group, usable in kidney disease.', [], 'Direct factor Xa inhibitors'),
    ('coagulation', ['r7'], 'Edoxaban', D, INH, 'Once daily.', [], 'Direct factor Xa inhibitors'),
    ('coagulation', ['r7', 'r8'], 'Heparin', D, INH, 'Unfractionated: Xa and thrombin. IV, monitored by PTT, reversed by protamine; HIT.', ['unfractionated heparin', 'UFH'], 'Heparins'),
    ('coagulation', ['r7'], 'Enoxaparin', D, INH, 'Low-molecular-weight heparin: mostly Xa. Subcutaneous, no routine monitoring (anti-Xa if needed); cleared by the kidney.', ['LMWH', 'low-molecular-weight heparin'], 'Heparins'),
    ('coagulation', ['r7'], 'Fondaparinux', D, INH, 'Synthetic pentasaccharide: Xa only, through antithrombin. No HIT.', [], 'Heparins'),
    ('coagulation', ['r8'], 'Dabigatran', D, INH, 'Oral; idarucizumab reverses it.', [], 'Direct thrombin inhibitors'),
    ('coagulation', ['r8'], 'Argatroban', D, INH, 'IV, cleared by the liver: HIT.', [], 'Direct thrombin inhibitors'),
    ('coagulation', ['r8'], 'Bivalirudin', D, INH, 'IV, short-acting: during PCI.', [], 'Direct thrombin inhibitors'),
    ('coagulation', ['r14'], 'Alteplase', D, ACT, 'Recombinant tPA, IV infusion: stroke within 4.5 hours, MI, PE.', ['tPA'], 'Thrombolytics'),
    ('coagulation', ['r14'], 'Tenecteplase', D, ACT, 'A single IV bolus: MI, increasingly stroke.', ['TNK'], 'Thrombolytics'),
    ('coagulation', ['r14'], 'Reteplase', D, ACT, 'Two IV boluses: MI.', [], 'Thrombolytics'),
    ('coagulation', ['r14'], 'Tranexamic acid', D, INH, 'Trauma, postpartum hemorrhage, heavy menstrual bleeding.', ['TXA'], 'Antifibrinolytics'),
    ('coagulation', ['r14'], 'Aminocaproic acid', D, INH, 'Bleeding after surgery; also reverses thrombolytics.', ['EACA'], 'Antifibrinolytics'),
    ('complement', ['r8', 'r9'], 'Eculizumab', D, INH, 'Every two weeks, IV.', [], 'Complement C5 inhibitors'),
    ('complement', ['r8', 'r9'], 'Ravulizumab', D, INH, 'Longer-acting: every eight weeks.', [], 'Complement C5 inhibitors'),
    ('nephron-pct', ['r9'], 'Empagliflozin', D, INH, 'Lowers cardiovascular death in type 2 diabetes; heart failure.', [], 'SGLT2 inhibitors'),
    ('nephron-pct', ['r9'], 'Dapagliflozin', D, INH, 'Heart failure and CKD, with or without diabetes.', [], 'SGLT2 inhibitors'),
    ('nephron-pct', ['r9'], 'Canagliflozin', D, INH, 'Type 2 diabetes; a warning for lower-limb amputations.', [], 'SGLT2 inhibitors'),
    ('nephron-pct', ['r5', 'r7'], 'Acetazolamide', D, INH, 'Blocks carbonic anhydrase, so bicarbonate is lost in the urine: glaucoma, altitude sickness, IIH; hyperchloremic metabolic acidosis.', ['carbonic anhydrase inhibitors'], None),
    ('nephron-tal', ['r1', 'r3', 'r5'], 'Furosemide', D, INH, 'The most used; oral or IV. A sulfonamide.', [], 'Loop diuretics'),
    ('nephron-tal', ['r1', 'r3', 'r5'], 'Bumetanide', D, INH, 'About 40 times as potent as furosemide by weight; reliably absorbed. A sulfonamide.', [], 'Loop diuretics'),
    ('nephron-tal', ['r1', 'r3', 'r5'], 'Torsemide', D, INH, 'Long-acting, reliably absorbed. A sulfonamide.', [], 'Loop diuretics'),
    ('nephron-tal', ['r1', 'r3', 'r5'], 'Ethacrynic acid', D, INH, 'Not a sulfonamide (for sulfa allergy); the most ototoxic.', [], 'Loop diuretics'),
    ('nephron-dct', ['r1', 'r4'], 'Hydrochlorothiazide', D, INH, 'The common one.', ['HCTZ'], 'Thiazides'),
    ('nephron-dct', ['r1', 'r4'], 'Chlorthalidone', D, INH, 'Thiazide-like, long-acting; stronger evidence in hypertension.', [], 'Thiazides'),
    ('nephron-dct', ['r1', 'r4'], 'Metolazone', D, INH, 'Thiazide-like; still works at low GFR, added to a loop diuretic for resistant edema.', [], 'Thiazides'),
    ('nephron-cd-principal', ['r1'], 'Amiloride', D, INH, 'Liddle syndrome; lithium-induced nephrogenic DI (blocks lithium entering the cell).', [], 'ENaC blockers'),
    ('nephron-cd-principal', ['r1'], 'Triamterene', D, INH, 'Usually paired with hydrochlorothiazide; can cause kidney stones.', [], 'ENaC blockers'),
    ('nephron-cd-principal', ['r5'], 'Tolvaptan', D, INH, 'Oral, V2-selective: SIADH, autosomal dominant polycystic kidney disease. Liver injury.', [], 'Vaptans'),
    ('nephron-cd-principal', ['r5'], 'Conivaptan', D, INH, 'IV, blocks V1a too: hospital hyponatremia.', [], 'Vaptans'),
    ('nephron-cd-principal', ['r5'], 'Lithium', D, INH, 'Blunts ADH’s effect on aquaporin-2 insertion: nephrogenic diabetes insipidus (demeclocycline likewise).', ['demeclocycline'], None),
    ('nephron-glomerulus', ['r1'], 'Lisinopril', D, INH, 'Once daily; not a prodrug, cleared by the kidney.', [], 'ACE inhibitors'),
    ('nephron-glomerulus', ['r1'], 'Enalapril', D, INH, 'A prodrug; enalaprilat is the IV form.', [], 'ACE inhibitors'),
    ('nephron-glomerulus', ['r1'], 'Captopril', D, INH, 'Short-acting, with a sulfhydryl group: rash, taste changes; the captopril renal scan.', [], 'ACE inhibitors'),
    ('nephron-glomerulus', ['r1'], 'Losartan', D, INH, 'Also lowers uric acid.', [], 'ARBs'),
    ('nephron-glomerulus', ['r1'], 'Valsartan', D, INH, 'With sacubitril (a neprilysin inhibitor) for heart failure with reduced ejection fraction.', [], 'ARBs'),
    ('nephron-glomerulus', ['r1'], 'Ibuprofen', D, INH, NSAID_GFR, [], 'NSAIDs'),
    ('nephron-glomerulus', ['r1'], 'Naproxen', D, INH, NSAID_GFR, [], 'NSAIDs'),
    ('nephron-glomerulus', ['r1'], 'Indomethacin', D, INH, NSAID_GFR, [], 'NSAIDs'),
    ('nephron-glomerulus', ['r1'], 'Ketorolac', D, INH, NSAID_GFR, [], 'NSAIDs'),
]

assert all(c is None or c in CLASSES for *_, c in TABLE), 'a drug names a class that isn’t in CLASSES'
by = {}
for pid, rids, name, kind, effect, note, aliases, cls in TABLE:
    for rid in rids:
        d = {'name': name, 'kind': kind, 'effect': effect, 'note': note, 'aliases': aliases}
        if cls: d['cls'] = cls
        by.setdefault(pid, {}).setdefault(rid, []).append(d)
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
used = {c for *_, c in TABLE if c}
(ROOT / 'data' / 'drug-classes.json').write_text(json.dumps({c: {'note': n, 'show': s, 'aliases': a} for c, (n, s, a) in CLASSES.items() if c in used}, indent=1, ensure_ascii=False) + '\n')
print(f'{len(used)} drug classes')
