#!/usr/bin/env python3
"""Writes the nephron segment pathways (data/pathways/nephron-*.json): python3 tools/nephron.py

Each segment is one tubular cell drawn as a grid: tubular lumen | cell | blood or interstitium (column 1 | 2 | 3; the
lumen can borrow column 0). Every solute that crosses a membrane is a transport step naming its carrier; steps between
cells are marked paracellular (no carrier on the membrane). The segments link in the order the fluid flows, so the
New quiz suggests them together, and studied together they draw as a textbook nephron (draw.js nephronSVG).
Edit the content here and rerun; ids are stable, so answer history survives."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LUM = 'tubular lumen'

ORDER = ['glomerulus', 'pct', 'thin-descending', 'thin-ascending', 'tal', 'dct', 'cd-principal', 'cd-intercalated']
NAMES = {'glomerulus': 'Glomerulus', 'pct': 'Proximal convoluted tubule', 'thin-descending': 'Thin descending limb',
         'thin-ascending': 'Thin ascending limb', 'tal': 'Thick ascending limb', 'dct': 'Distal convoluted tubule',
         'cd-principal': 'Collecting duct: principal cell', 'cd-intercalated': 'Collecting duct: α-intercalated cell'}

# Carriers used in more than one segment.
COMMON = {
 'nak': ('Na⁺/K⁺-ATPase', ['Na/K ATPase', 'Na+/K+ ATPase', 'sodium-potassium pump', 'Na pump', 'Na-K-ATPase'],
         'On the basolateral side of every tubular cell: 3 Na⁺ out, 2 K⁺ in, using ATP. Keeping cell Na⁺ low is what drives every apical Na⁺ carrier (secondary active transport).'),
 'clckb': ('ClC-Kb (chloride channel)', ['ClC-Kb', 'CLCNKB', 'chloride channel', 'barttin', 'ClC-K'],
           'Basolateral Cl⁻ channel that needs its partner barttin to work. Loss of either: Bartter syndrome (types 3 and 4).'),
 'aqp1': ('Aquaporin-1', ['AQP1', 'aquaporin 1', 'aquaporin', 'water channel'],
          'Always-open water channels on both membranes (PCT and thin descending limb). Not regulated by ADH.'),
 'diff': ('Simple diffusion', ['diffusion', 'simple diffusion', 'passive diffusion'], 'Lipid-soluble gases (CO₂, NH₃) cross membranes without a carrier.'),
 'ca2': ('Carbonic anhydrase II', ['CA II', 'carbonic anhydrase', 'CA2', 'cytosolic carbonic anhydrase'],
         'Inside the cell: CO₂ + H₂O → H₂CO₃ → H⁺ + HCO₃⁻. Acetazolamide blocks it. CA II deficiency: renal tubular acidosis with osteopetrosis.'),
 'romk': ('ROMK (K⁺ channel)', ['ROMK', 'Kir1.1', 'KCNJ1', 'renal outer medullary K channel', 'K+ channel', 'potassium channel'],
          'Apical K⁺ channel.'),
}

class Seg:
    def __init__(self, key, cell, other, membranes):
        self.key, self.cell, self.other, self.membranes = key, cell, other, membranes
        self.mets, self.enz, self.rx = {}, {}, []
        self.col = {LUM: 1, cell: 2, other: 3}
        self.word = {LUM: 'lumen', cell: 'cell', other: 'blood' if other.startswith('blood') else 'interstitium'}
    def E(self, eid, name=None, aliases=(), notes=''):
        if name is None: name, aliases, notes = COMMON[eid]
        self.enz[eid] = {'name': name, 'short': '', 'aliases': list(aliases), **({'notes': notes} if notes else {})}
    def M(self, mid, sym, aliases, loc, row, col=None, notes='', word=None):
        self.mets[mid] = {'name': f'{sym} ({word or self.word[loc]})', 'short': '', 'aliases': [sym, *aliases], 'loc': loc,
                          'pos': [self.col[loc] if col is None else col, row], **({'notes': notes} if notes else {})}
    def S(self, eid, fr, to, cin=(), cout=(), transport=True, para=False, also_from=None, tags=None, loc=None):
        r = {'id': f'r{len(self.rx) + 1}', 'enzyme': eid, 'from': fr, 'to': to, 'reversible': False, 'cofactors': {'in': list(cin), 'out': list(cout)}}
        a, b = self.mets[fr]['loc'], self.mets[to]['loc']
        if transport: r['transport'] = True
        if para: r['paracellular'] = True
        r['loc'] = loc or ('tight junction (between cells)' if para else 'apical membrane' if LUM in (a, b) else 'basolateral membrane' if transport else a)
        if also_from: r['also_from'] = also_from
        if tags: r['tags'] = tags
        self.rx.append(r)
    def ion(self, base, sym, aliases, row, path, notes=None, cols=None):
        """A solute in each compartment it visits along `path` (a list of locs), one step per crossing (`steps`)."""
        for loc in path:
            self.M(f'{base}_{self.word[loc][0]}', sym, aliases, loc, row, notes=(notes or {}).get(self.word[loc][0], ''), col=(cols or {}).get(loc))
        return [f'{base}_{self.word[loc][0]}' for loc in path]
    def out(self, name, aliases, summary, tissue, tags=('Drug targets',), distractors=None, cofactors=None):
        i = ORDER.index(self.key)
        links = []
        if i + 1 < len(ORDER) and self.key != 'cd-principal':
            nxt = ORDER[i + 1]
            at = next(k for k, m in self.mets.items() if m['loc'].startswith(LUM))
            links.append({'at': at, 'to': f'nephron-{nxt}', 'dir': 'out', 'via': 'the tubular fluid flows on' if self.key != 'cd-intercalated' else ''})
        if self.key == 'cd-principal':
            at = next(k for k, m in self.mets.items() if m['loc'].startswith(LUM))
            links.append({'at': at, 'to': 'nephron-cd-intercalated', 'dir': 'out', 'via': 'the other cell type lining the duct'})
        links = [l for l in links if l['to'] != 'nephron-cd-intercalated' or self.key == 'cd-principal']
        for l in links:
            if not l['via']: del l['via']
        p = {'id': f'nephron-{self.key}', 'name': name, 'group': 'Renal', 'systems': ['Renal'], 'tags': list(tags), 'aliases': aliases,
             'summary': summary, 'tissue': tissue, 'icon': 'water_drop', 'color': 'gold', 'layout': 'grid', 'grid_columns': [],
             'column_zones': {'membranes': self.membranes}, 'nephron': {'segment': self.key, 'order': i}, 'terms': {'met': 'solute'},
             'cofactors': cofactors or {}, 'distractors': distractors or {'metabolites': [], 'enzymes': []},
             'links': links, 'metabolites': self.mets, 'enzymes': self.enz, 'reactions': self.rx}
        (ROOT / 'data/pathways' / f'nephron-{self.key}.json').write_text(json.dumps(p, indent=1, ensure_ascii=False) + '\n')
        print(f'nephron-{self.key}: {len(self.mets)} boxes, {len(self.rx)} steps')

NA = ('Na⁺', ['sodium', 'Na']); K = ('K⁺', ['potassium', 'K']); CL = ('Cl⁻', ['chloride', 'Cl']); H = ('H⁺', ['hydrogen ion', 'proton', 'H'])
HCO3 = ('HCO₃⁻', ['bicarbonate', 'HCO3-', 'HCO3']); CO2 = ('CO₂', ['carbon dioxide', 'CO2']); W = ('Water', ['water', 'H₂O', 'H2O'])
CA = ('Ca²⁺', ['calcium', 'Ca']); MG = ('Mg²⁺', ['magnesium', 'Mg']); UREA = ('Urea', ['urea'])
DIST_E = ['NKCC2', 'NCC (Na⁺–Cl⁻ cotransporter)', 'ENaC', 'Aquaporin-2', 'ROMK', 'H⁺-ATPase', 'Pendrin', 'SGLT2', 'NHE3', 'AE1']

# ---------- Glomerulus ----------
g = Seg('glomerulus', None, 'blood (glomerular capillary)', ['filtration barrier'])
g.col = {LUM: 1, 'blood (glomerular capillary)': 2}; g.word = {LUM: 'Bowman’s space', 'blood (glomerular capillary)': 'blood'}
BOW = 'tubular lumen (Bowman’s space)'
g.col[BOW] = 1; g.word[BOW] = 'Bowman’s space'
g.E('filt', 'Ultrafiltration (Starling forces)', ['filtration', 'ultrafiltration', 'glomerular filtration', 'Starling forces'],
    'Glomerular capillary hydrostatic pressure pushes plasma water and small solutes out, against the pressure in Bowman’s space and the plasma oncotic pressure. GFR is about 120 mL/min (inulin clearance; creatinine clearance estimates it). Constricting the efferent arteriole (angiotensin II) raises GFR; ACE inhibitors and ARBs lower it. Dilating the afferent arteriole (prostaglandins) raises it; NSAIDs lower it. Filtration fraction = GFR / RPF, about 20%.')
g.E('barrier', 'Filtration barrier (size and charge)', ['filtration barrier', 'glomerular filtration barrier', 'charge barrier', 'size barrier', 'podocytes', 'GBM'],
    'Fenestrated endothelium, the glomerular basement membrane (negatively charged heparan sulfate) and podocyte foot processes with slit diaphragms (nephrin). Albumin is held back by its size and negative charge. Nephrotic syndrome: the barrier (often the podocytes) fails, more than 3.5 g/day of protein. Nephritic syndrome: inflammation breaks it, letting red cells through (hematuria, RBC casts).')
for row, (base, (sym, al)) in enumerate([('w', W), ('na', NA), ('glc', ('Glucose', ['glucose'])), ('alb', ('Albumin', ['albumin', 'plasma proteins', 'protein'])), ('rbc', ('Red blood cells', ['RBCs', 'red cells', 'erythrocytes']))]):
    g.M(f'{base}_b', sym, al, 'blood (glomerular capillary)', row, word='blood')
    g.M(f'{base}_l', sym, al, BOW, row, word='Bowman’s space')
    if base in ('alb', 'rbc'): g.S('barrier', f'{base}_b', f'{base}_l', tags=['blocked'], loc='filtration barrier')
    else: g.S('filt', f'{base}_b', f'{base}_l', loc='filtration barrier')
g.mets['alb_l']['notes'] = 'Normally almost none: albumin in the urine (>30 mg/day) is an early sign of diabetic nephropathy; heavy proteinuria is nephrotic syndrome.'
g.mets['rbc_l']['notes'] = 'Normally none. Dysmorphic red cells and RBC casts mean glomerular bleeding: nephritic syndrome.'
g.out('Glomerulus', ['glomerular filtration', 'glomerulus', 'Bowman’s capsule', 'filtration barrier', 'renal corpuscle'],
      'Where the nephron starts: plasma is filtered from the glomerular capillaries into Bowman’s space through a barrier of fenestrated endothelium, basement membrane and podocytes. Water and small solutes (Na⁺, glucose, urea, amino acids) pass freely; albumin and cells are held back by size and negative charge. GFR (~120 mL/min) depends on Starling forces and the tone of the afferent (prostaglandins dilate; NSAIDs) and efferent (angiotensin II constricts; ACE inhibitors) arterioles. Nephrotic syndrome: protein leaks; nephritic syndrome: blood and inflammation.',
      'kidney: renal corpuscle (cortex)', tags=('Drug targets',),
      distractors={'metabolites': ['Albumin (blood)', 'Urea (Bowman’s space)'], 'enzymes': ['Aquaporin-1', 'Tubular secretion', 'Na⁺/K⁺-ATPase']})

# ---------- Proximal convoluted tubule ----------
p = Seg('pct', 'cytosol (PCT cell)', 'blood (peritubular capillary)', ['apical membrane (brush border)', 'basolateral membrane'])
L, C, B = LUM, p.cell, p.other
for e, args in [('nhe3', ('NHE3 (Na⁺/H⁺ exchanger)', ['NHE3', 'Na+/H+ exchanger', 'sodium-hydrogen exchanger', 'Na/H exchanger', 'NHE', 'SLC9A3', 'Na⁺/H⁺ antiporter'],
    'On the brush border: Na⁺ in, H⁺ (or NH₄⁺) out. The main way the PCT takes up Na⁺. Angiotensin II stimulates it, so more Na⁺, water and HCO₃⁻ are reabsorbed (contraction alkalosis).')),
 ('nak', None),
 ('ca4', ('Carbonic anhydrase IV', ['CA IV', 'carbonic anhydrase', 'CA4', 'brush border carbonic anhydrase'],
    'On the brush border: H⁺ + HCO₃⁻ → H₂CO₃ → CO₂ + H₂O, so filtered HCO₃⁻ can be reclaimed as CO₂. Acetazolamide blocks it: HCO₃⁻ stays in the urine (alkaline urine, metabolic acidosis).')),
 ('diff', ('Simple diffusion', ['diffusion', 'simple diffusion', 'passive diffusion'], 'CO₂ is lipid-soluble and crosses the membrane without a carrier.')),
 ('ca2', ('Carbonic anhydrase II', ['CA II', 'carbonic anhydrase', 'CA2', 'cytosolic carbonic anhydrase'],
    'Inside the cell: CO₂ + H₂O → H₂CO₃ → H⁺ + HCO₃⁻. The H⁺ is secreted again by NHE3; the HCO₃⁻ goes to the blood. Acetazolamide blocks it too. CA II deficiency: renal tubular acidosis with osteopetrosis.')),
 ('nbce1', ('NBCe1 (Na⁺–HCO₃⁻ cotransporter)', ['NBCe1', 'NBC1', 'Na+-HCO3- cotransporter', 'sodium-bicarbonate cotransporter', 'SLC4A4', 'NBC'],
    'Basolateral: carries 1 Na⁺ with 3 HCO₃⁻ into the blood. Mutations cause proximal (type 2) renal tubular acidosis, with eye findings.')),
 ('sglt2', ('SGLT2 (Na⁺–glucose cotransporter)', ['SGLT2', 'SGLT', 'sodium-glucose cotransporter 2', 'Na-glucose cotransporter', 'SLC5A2'],
    'Takes up about 90% of filtered glucose, with Na⁺ (SGLT1 takes the rest further along). Saturates around a plasma glucose of 200 mg/dL, so glucose spills into urine above that (diabetes; also pregnancy, as GFR rises). SGLT2 inhibitors (-gliflozins: empagliflozin, dapagliflozin) block it.')),
 ('glut2', ('GLUT2', ['GLUT2', 'glucose transporter 2', 'SLC2A2'], 'Basolateral facilitated diffusion of glucose out to the blood.')),
 ('naaa', ('Na⁺–amino acid cotransporters', ['amino acid transporters', 'Na+-amino acid cotransporter', 'sodium-coupled amino acid transporters', 'B0AT1', 'rBAT'],
    'Several Na⁺-coupled carriers reclaim all filtered amino acids. Defects: Hartnup disease (B⁰AT1, neutral amino acids like tryptophan: pellagra-like rash) and cystinuria (cystine, ornithine, lysine, arginine: cystine stones).')),
 ('aaout', ('Basolateral amino acid transporters', ['amino acid transporters', 'basolateral amino acid transporter'], 'Let amino acids out of the cell into the blood.')),
 ('napi', ('NaPi-IIa (Na⁺–phosphate cotransporter)', ['NaPi-IIa', 'NaPi2a', 'Na+-phosphate cotransporter', 'sodium-phosphate cotransporter', 'SLC34A1', 'NPT2a'],
    'Reclaims most filtered phosphate. PTH and FGF23 pull it out of the membrane, so phosphate is lost in the urine (hypophosphatemia in hyperparathyroidism and FGF23-excess rickets).')),
 ('piout', ('Basolateral phosphate exit (carrier not established)', ['basolateral phosphate transporter', 'phosphate exit', 'XPR1'], 'How phosphate leaves the cell for the blood is not settled (XPR1 is a candidate).')),
 ('snat3', ('SNAT3 (glutamine transporter)', ['SNAT3', 'SLC38A3', 'glutamine transporter', 'basolateral glutamine transporter'],
    'Takes glutamine up from the blood for ammoniagenesis; there is more of it in metabolic acidosis.')),
 ('glnase', ('Glutaminase (ammoniagenesis)', ['glutaminase', 'ammoniagenesis', 'phosphate-dependent glutaminase', 'glutamate dehydrogenase'],
    'Glutamine → glutamate → α-ketoglutarate, releasing 2 NH₄⁺ and making 2 new HCO₃⁻ (to the blood). Ammoniagenesis rises in acidosis and with hypokalemia; hyperkalemia suppresses it (type 4 RTA: low urine NH₄⁺).')),
 ('aqp1', ('Aquaporin-1', ['AQP1', 'aquaporin 1', 'aquaporin', 'water channel'],
    'Always open water channels on both membranes of the PCT (and thin descending limb): water follows solute, so the PCT reabsorbs isotonically. Not regulated by ADH.')),
 ('oat', ('OAT1 and OAT3 (organic anion transporters)', ['OAT1', 'OAT3', 'OAT', 'organic anion transporter', 'SLC22A6', 'SLC22A8'],
    'Basolateral: take up PAH, penicillin, methotrexate, NSAIDs and most diuretics from the blood, which is how loop and thiazide diuretics reach their targets in the lumen. Probenecid blocks them (it raises penicillin levels).')),
 ('mrp', ('MRP2 and MRP4 (apical efflux pumps)', ['MRP2', 'MRP4', 'MRP', 'apical efflux', 'multidrug resistance-associated protein'], 'Push organic anions out into the lumen (secretion).'))]:
    p.E(e, *(args or ()))
na = p.ion('na', *NA, 0, [L, C, B], notes={'l': 'The PCT reabsorbs about 65% of filtered Na⁺, with water following (isotonic).'})
p.S('nhe3', na[0], na[1]); p.S('nak', na[1], na[2], cin=['atp'], cout=['adp', 'pi'])
k = p.ion('k', *K, 1, [C, B]); p.S('nak', k[1], k[0])
h = p.ion('h', *H, 2, [C, L]); p.S('nhe3', h[0], h[1])
p.M('hco3_l', *HCO3, L, 3, col=0, notes='Filtered bicarbonate: the PCT reclaims about 85% of it, not by carrying it across but by turning it into CO₂.')
p.M('co2_l', *CO2, L, 3); p.S('ca4', 'h_l', 'co2_l', cout=['h2o'], transport=False, also_from=['hco3_l'], loc=L)
p.M('co2_c', *CO2, C, 3); p.S('diff', 'co2_l', 'co2_c')
p.M('hco3_c', *HCO3, C, 4); p.M('hco3_b', *HCO3, B, 4)
p.S('ca2', 'co2_c', 'hco3_c', cin=['h2o'], cout=['h'], transport=False, loc=C); p.S('nbce1', 'hco3_c', 'hco3_b')
glc = p.ion('glc', 'Glucose', ['glucose'], 5, [L, C, B], notes={'l': 'Normally all reabsorbed here; glucosuria starts when plasma glucose passes about 200 mg/dL.'})
p.S('sglt2', glc[0], glc[1]); p.S('glut2', glc[1], glc[2])
aa = p.ion('aa', 'Amino acids', ['amino acids'], 6, [L, C, B]); p.S('naaa', aa[0], aa[1]); p.S('aaout', aa[1], aa[2])
pi = p.ion('pi', 'Phosphate', ['phosphate', 'PO₄³⁻', 'Pi', 'PO4'], 7, [L, C, B]); p.S('napi', pi[0], pi[1]); p.S('piout', pi[1], pi[2])
gln = p.ion('gln', 'Glutamine', ['glutamine', 'Gln'], 8, [B, C]); p.S('snat3', gln[0], gln[1])
p.M('nh4_c', 'NH₄⁺', ['ammonium', 'NH4+'], C, 9); p.M('nh4_l', 'NH₄⁺', ['ammonium', 'NH4+'], L, 9, notes='Secreted ammonium carries acid out in the urine (most of the kidney’s acid excretion).')
p.S('glnase', 'gln_c', 'nh4_c', cout=['hco3'], transport=False, loc=C); p.S('nhe3', 'nh4_c', 'nh4_l')
w = p.ion('w', *W, 10, [L, C, B]); p.S('aqp1', w[0], w[1]); p.S('aqp1', w[1], w[2])
oa = p.ion('oa', 'Organic anions', ['organic anions', 'PAH', 'para-aminohippurate', 'drugs'], 11, [B, C, L],
           notes={'b': 'PAH (para-aminohippurate) is almost all secreted in one pass, so its clearance measures renal plasma flow.'})
p.S('oat', oa[0], oa[1]); p.S('mrp', oa[1], oa[2])
p.out('Proximal convoluted tubule', ['PCT', 'proximal tubule', 'proximal convoluted tubule', 'nephron: proximal tubule', 'early tubule'],
      'The workhorse segment. Reabsorbs about 65% of filtered Na⁺ and water (isotonically), about 85% of HCO₃⁻, almost all glucose and amino acids and most phosphate; makes NH₄⁺ (ammoniagenesis) and secretes organic anions and drugs. Angiotensin II stimulates NHE3; PTH inhibits Na⁺–phosphate cotransport. Drugs: acetazolamide (carbonic anhydrase), SGLT2 inhibitors. Generalized failure is Fanconi syndrome; failure to reclaim HCO₃⁻ is proximal (type 2) renal tubular acidosis.',
      'kidney: proximal convoluted tubule (cortex)', cofactors={'h': {'name': 'H⁺', 'aliases': ['proton', 'hydrogen ion']}},
      distractors={'metabolites': ['Urea (lumen)', 'Ca²⁺ (lumen)', 'Mg²⁺ (lumen)', 'Cl⁻ (cell)'], 'enzymes': [e for e in DIST_E if e not in ('SGLT2', 'NHE3')]})

# ---------- Thin descending limb ----------
d = Seg('thin-descending', 'cytosol (thin limb cell)', 'interstitium (medulla)', ['apical membrane', 'basolateral membrane'])
L, C, I = LUM, d.cell, d.other
d.E('aqp1', *COMMON['aqp1'][:2], 'Always-open water channels on both membranes: water leaves by osmosis into the ever saltier medulla, so the fluid concentrates on the way down.')
d.E('uta2', 'UT-A2 (urea transporter)', ['UT-A2', 'urea transporter', 'SLC14A2', 'urea channel'],
    'Lets urea from the medullary interstitium back into the thin limbs (urea recycling), part of how the medulla keeps its high osmolality.')
w = d.ion('w', *W, 0, [L, C, I], notes={'l': 'Leaves the lumen by osmosis: the fluid reaches about 1200 mOsm at the tip of a long loop.'})
d.S('aqp1', w[0], w[1]); d.S('aqp1', w[1], w[2])
u = d.ion('urea', *UREA, 1, [I, C, L]); d.S('uta2', u[0], u[1]); d.S('uta2', u[1], u[2])
d.out('Thin descending limb', ['thin descending limb', 'descending limb', 'descending loop of Henle', 'tDL', 'concentrating segment'],
      'Water leaves by osmosis through aquaporin-1 into the hypertonic medulla, but the segment is impermeable to NaCl, so the fluid concentrates as it descends (up to ~1200 mOsm at the tip of long loops). The concentrating segment.',
      'kidney: loop of Henle, thin descending limb (medulla)', tags=(),
      distractors={'metabolites': ['Na⁺ (interstitium)', 'Glucose (lumen)'], 'enzymes': ['Aquaporin-2', 'NKCC2', 'ENaC', 'ROMK']})

# ---------- Thin ascending limb ----------
a = Seg('thin-ascending', 'cytosol (thin limb cell)', 'interstitium (medulla)', ['apical membrane', 'basolateral membrane'])
L, C, I = LUM, a.cell, a.other
a.E('clck1', 'ClC-K1 (chloride channel)', ['ClC-K1', 'CLCNKA', 'chloride channel', 'barttin', 'ClC-K'],
    'Chloride channel on both membranes of the thin ascending limb (with barttin): Cl⁻ leaves passively down its concentration gradient.')
a.E('para', 'Paracellular diffusion', ['paracellular', 'between cells', 'tight junction', 'passive diffusion'], 'Na⁺ follows Cl⁻ out between the cells, through the tight junctions, without a carrier.')
cl = a.ion('cl', *CL, 0, [L, C, I]); a.S('clck1', cl[0], cl[1]); a.S('clck1', cl[1], cl[2])
na = a.ion('na', *NA, 1, [L, I]); a.S('para', na[0], na[1], para=True)
a.mets['na_l']['notes'] = 'The fluid arriving from the tip is very salty, so NaCl leaks out passively here: no water follows (impermeable).'
a.out('Thin ascending limb', ['thin ascending limb', 'tAL', 'ascending thin limb'],
      'Impermeable to water. NaCl leaves passively (Cl⁻ through ClC-K1 channels, Na⁺ between the cells), so the fluid becomes less concentrated as it rises while the medulla stays salty.',
      'kidney: loop of Henle, thin ascending limb (inner medulla)', tags=(),
      distractors={'metabolites': ['Water (interstitium)', 'Glucose (lumen)'], 'enzymes': ['Aquaporin-1', 'NKCC2', 'Na⁺/K⁺-ATPase', 'ENaC']})

# ---------- Thick ascending limb ----------
t = Seg('tal', 'cytosol (TAL cell)', 'blood (peritubular capillary)', ['apical membrane', 'basolateral membrane'])
L, C, B = LUM, t.cell, t.other
t.E('nkcc2', 'NKCC2 (Na⁺–K⁺–2Cl⁻ cotransporter)', ['NKCC2', 'NKCC', 'Na-K-2Cl cotransporter', 'Na+/K+/2Cl- cotransporter', 'SLC12A1', 'furosemide-sensitive cotransporter'],
    'Carries Na⁺, K⁺ and 2 Cl⁻ into the cell. Loop diuretics (furosemide, bumetanide, torsemide, ethacrynic acid) block it: up to 25% of filtered Na⁺ escapes, the medullary gradient collapses, and more Ca²⁺ and Mg²⁺ are lost (“loops lose calcium”). Bartter syndrome type 1 (looks like taking a loop diuretic).')
t.E('nak'); t.E('clckb')
t.E('romk', 'ROMK (K⁺ channel)', COMMON['romk'][1],
    'Lets K⁺ back into the lumen so NKCC2 never runs short of K⁺, and makes the lumen positive, which pushes Ca²⁺ and Mg²⁺ out between the cells. Bartter syndrome type 2.')
t.E('para', 'Paracellular (lumen-positive voltage)', ['paracellular', 'between cells', 'tight junction', 'claudin-16', 'paracellin-1', 'claudin-19'],
    'The lumen-positive voltage drives Ca²⁺ and Mg²⁺ between the cells, through tight junctions made of claudin-16 and claudin-19 (their loss: familial hypomagnesemia with hypercalciuria). Loop diuretics remove the voltage, so more Ca²⁺ and Mg²⁺ are lost.')
na = t.ion('na', *NA, 0, [L, C, B], notes={'l': 'About 25% of filtered Na⁺ is reabsorbed here.'}); t.S('nkcc2', na[0], na[1]); t.S('nak', na[1], na[2], cin=['atp'], cout=['adp', 'pi'])
kk = t.ion('k', *K, 1, [L, C]); t.S('nkcc2', kk[0], kk[1]); t.S('romk', kk[1], kk[0])
cl = t.ion('cl', *CL, 2, [L, C, B]); t.S('nkcc2', cl[0], cl[1]); t.S('clckb', cl[1], cl[2])
ca = t.ion('ca', *CA, 3, [L, B]); t.S('para', ca[0], ca[1], para=True)
mg = t.ion('mg', *MG, 4, [L, B]); t.S('para', mg[0], mg[1], para=True)
t.out('Thick ascending limb', ['TAL', 'thick ascending limb', 'ascending loop of Henle', 'diluting segment', 'loop of Henle'],
      'The diluting segment. Actively reabsorbs about 25% of filtered NaCl through NKCC2 but is impermeable to water, so fluid leaves it hypotonic (~100 mOsm) and the salt it pumps out makes the medulla hypertonic (the countercurrent multiplier). K⁺ recycling through ROMK makes the lumen positive, which drives Ca²⁺ and Mg²⁺ reabsorption between the cells. Loop diuretics block NKCC2; Bartter syndrome is a genetic version. Makes uromodulin (Tamm–Horsfall protein, the matrix of casts); its macula densa senses NaCl for tubuloglomerular feedback and renin release.',
      'kidney: loop of Henle, thick ascending limb (outer medulla and cortex)',
      distractors={'metabolites': ['Water (blood)', 'Glucose (lumen)', 'H⁺ (lumen)'], 'enzymes': [e for e in DIST_E if e not in ('NKCC2', 'ROMK')]})

# ---------- Distal convoluted tubule ----------
dc = Seg('dct', 'cytosol (DCT cell)', 'blood (peritubular capillary)', ['apical membrane', 'basolateral membrane'])
L, C, B = LUM, dc.cell, dc.other
dc.E('ncc', 'NCC (Na⁺–Cl⁻ cotransporter)', ['NCC', 'Na-Cl cotransporter', 'Na+/Cl- cotransporter', 'thiazide-sensitive cotransporter', 'SLC12A3', 'NCCT'],
     'Carries Na⁺ with Cl⁻ into the cell (about 5% of filtered Na⁺). Thiazides block it (hydrochlorothiazide, chlorthalidone, metolazone): Na⁺ loss, and more Ca²⁺ reabsorbed (“thiazides take calcium in”; used for calcium stones). Gitelman syndrome: loss of NCC (hypokalemia, hypomagnesemia, low urine calcium).')
dc.E('nak'); dc.E('clckb')
dc.E('trpv5', 'TRPV5 (Ca²⁺ channel)', ['TRPV5', 'epithelial calcium channel', 'ECaC', 'calcium channel'],
     'Apical Ca²⁺ channel. PTH (and calcitriol) increase Ca²⁺ reabsorption here by adding TRPV5 and its partners.')
dc.E('ncx1', 'NCX1 (Na⁺/Ca²⁺ exchanger)', ['NCX1', 'Na+/Ca2+ exchanger', 'sodium-calcium exchanger', 'SLC8A1', 'PMCA', 'Ca2+-ATPase'],
     'Basolateral: 3 Na⁺ in for 1 Ca²⁺ out (with the Ca²⁺-ATPase PMCA). When thiazides lower cell Na⁺, this exit speeds up, one reason they raise Ca²⁺ reabsorption.')
dc.E('trpm6', 'TRPM6 (Mg²⁺ channel)', ['TRPM6', 'magnesium channel'], 'Apical Mg²⁺ channel; its mutations cause hypomagnesemia with secondary hypocalcemia.')
dc.E('mgout', 'Basolateral Mg²⁺ exit (carrier not established)', ['basolateral magnesium transporter', 'CNNM2', 'magnesium exit'], 'How Mg²⁺ leaves the cell is not settled (CNNM2 is a candidate).')
na = dc.ion('na', *NA, 0, [L, C, B]); dc.S('ncc', na[0], na[1]); dc.S('nak', na[1], na[2], cin=['atp'], cout=['adp', 'pi'])
k = dc.ion('k', *K, 1, [C, B]); dc.S('nak', k[1], k[0])
cl = dc.ion('cl', *CL, 2, [L, C, B]); dc.S('ncc', cl[0], cl[1]); dc.S('clckb', cl[1], cl[2])
ca = dc.ion('ca', *CA, 3, [L, C, B]); dc.S('trpv5', ca[0], ca[1]); dc.S('ncx1', ca[1], ca[2])
mg = dc.ion('mg', *MG, 4, [L, C, B]); dc.S('trpm6', mg[0], mg[1]); dc.S('mgout', mg[1], mg[2])
dc.out('Distal convoluted tubule', ['DCT', 'distal convoluted tubule', 'early distal tubule', 'distal tubule'],
       'Reabsorbs about 5% of filtered NaCl through NCC and stays impermeable to water, so it keeps diluting the fluid. The main site of hormone-regulated Ca²⁺ reabsorption: PTH adds TRPV5 channels. Thiazides block NCC (Na⁺ out, Ca²⁺ in); Gitelman syndrome is a genetic version.',
       'kidney: distal convoluted tubule (cortex)',
       distractors={'metabolites': ['Water (blood)', 'Glucose (lumen)', 'H⁺ (lumen)'], 'enzymes': [e for e in DIST_E if e not in ('NCC (Na⁺–Cl⁻ cotransporter)',)]})

# ---------- Collecting duct: principal cell ----------
pc = Seg('cd-principal', 'cytosol (principal cell)', 'blood (peritubular capillary)', ['apical membrane', 'basolateral membrane'])
L, C, B = LUM, pc.cell, pc.other
pc.E('enac', 'ENaC (epithelial Na⁺ channel)', ['ENaC', 'epithelial sodium channel', 'amiloride-sensitive sodium channel', 'SCNN1'],
     'Apical Na⁺ channel. Aldosterone (through the mineralocorticoid receptor) adds ENaC and Na⁺/K⁺-ATPase; spironolactone and eplerenone block the receptor; amiloride and triamterene block ENaC (K⁺-sparing diuretics). Liddle syndrome: ENaC that is not removed (gain of function): hypertension, hypokalemia, low renin and aldosterone. The lumen-negative voltage it makes drives K⁺ and H⁺ secretion.')
pc.E('nak')
pc.E('romk', 'ROMK and BK (K⁺ channels)', ['ROMK', 'BK', 'maxi-K', 'K+ channels', 'potassium channels', 'Kir1.1'],
     'Secrete K⁺ into the lumen: more with aldosterone, with high flow and with more Na⁺ reaching here, which is why loop and thiazide diuretics cause hypokalemia (and K⁺-sparing diuretics do not).')
pc.E('aqp2', 'Aquaporin-2 (ADH)', ['AQP2', 'aquaporin 2', 'aquaporin', 'water channel', 'ADH-regulated water channel'],
     'ADH (vasopressin) binds V2 receptors → cAMP → AQP2 inserted in the apical membrane, and water follows the hypertonic medulla (concentrated urine). Central diabetes insipidus: no ADH (desmopressin works). Nephrogenic diabetes insipidus: V2 or AQP2 defects, lithium, demeclocycline. SIADH: too much ADH (vaptans block V2).')
pc.E('aqp34', 'Aquaporin-3 and aquaporin-4', ['AQP3', 'AQP4', 'aquaporins', 'basolateral aquaporins'], 'Always-open basolateral water channels: water leaves the cell for the blood.')
pc.E('uta1', 'UT-A1 (urea channel, ADH)', ['UT-A1', 'urea transporter', 'urea channel', 'SLC14A2'],
     'In the inner medullary collecting duct; ADH adds more. Urea leaves into the medulla, building its osmolality so more water can be pulled out.')
pc.E('uta3', 'UT-A3 (urea channel)', ['UT-A3', 'urea transporter', 'basolateral urea channel'], 'Basolateral urea exit to the interstitium.')
na = pc.ion('na', *NA, 0, [L, C, B], notes={'l': 'Only about 3% of filtered Na⁺ is left to reabsorb here, but this is where aldosterone sets the final amount.'})
pc.S('enac', na[0], na[1]); pc.S('nak', na[1], na[2], cin=['atp'], cout=['adp', 'pi'])
k = pc.ion('k', *K, 1, [B, C, L], notes={'l': 'Most of the K⁺ in urine was secreted here.'}); pc.S('nak', k[0], k[1]); pc.S('romk', k[1], k[2])
w = pc.ion('w', *W, 2, [L, C, B]); pc.S('aqp2', w[0], w[1]); pc.S('aqp34', w[1], w[2])
u = pc.ion('urea', *UREA, 3, [L, C, B]); pc.S('uta1', u[0], u[1]); pc.S('uta3', u[1], u[2])
pc.out('Collecting duct: principal cell', ['principal cell', 'collecting duct', 'cortical collecting duct', 'CCD', 'late distal tubule', 'collecting tubule'],
       'Where the final amounts are set by hormones. Aldosterone adds ENaC and Na⁺/K⁺-ATPase: Na⁺ reabsorbed, K⁺ secreted (through ROMK and BK). ADH inserts aquaporin-2 so water follows the medullary gradient, and opens urea channels in the inner medulla. Drugs: K⁺-sparing diuretics (amiloride, triamterene on ENaC; spironolactone, eplerenone on the receptor); vaptans block ADH’s V2 receptor.',
       'kidney: collecting duct (cortex to inner medulla)',
       distractors={'metabolites': ['Glucose (lumen)', 'H⁺ (lumen)', 'HCO₃⁻ (blood)'], 'enzymes': [e for e in DIST_E if e not in ('ENaC', 'Aquaporin-2', 'ROMK')]})

# ---------- Collecting duct: α-intercalated cell ----------
ic = Seg('cd-intercalated', 'cytosol (α-intercalated cell)', 'blood (peritubular capillary)', ['apical membrane', 'basolateral membrane'])
L, C, B = LUM, ic.cell, ic.other
ic.E('diff')
ic.E('ca2')
ic.E('hatp', 'H⁺-ATPase', ['H+-ATPase', 'proton pump', 'V-ATPase', 'vacuolar H+-ATPase', 'H+ ATPase'],
     'Pumps H⁺ into the urine (aldosterone stimulates it). Distal (type 1) renal tubular acidosis: α-intercalated cells cannot acidify the urine: urine pH stays above 5.5, hypokalemia, calcium phosphate stones (amphotericin B, Sjögren syndrome, lupus, genetic V-ATPase or AE1 defects).')
ic.E('hk', 'H⁺/K⁺-ATPase', ['H+/K+-ATPase', 'H+/K+ ATPase', 'proton-potassium pump', 'colonic H/K ATPase'],
     'Swaps H⁺ out for K⁺ in: reclaims K⁺ in K⁺ depletion (one reason hypokalemia goes with alkalosis).')
ic.E('ae1', 'AE1 (Cl⁻/HCO₃⁻ exchanger)', ['AE1', 'band 3', 'SLC4A1', 'Cl-/HCO3- exchanger', 'anion exchanger 1'],
     'Basolateral: new HCO₃⁻ out to the blood in exchange for Cl⁻ (the same protein as band 3 in red cells). Mutations cause distal RTA (sometimes with hereditary spherocytosis).')
ic.E('trap', 'NH₃ trapping (NH₃ + H⁺ → NH₄⁺)', ['ammonia trapping', 'diffusion trapping', 'NH3 trapping', 'ammonium buffer'],
     'NH₃ made in the PCT diffuses into the lumen and takes up a secreted H⁺; NH₄⁺ cannot diffuse back, so it is trapped. The main way acid leaves; it rises in acidosis.')
ic.E('titr', 'Titratable acid (HPO₄²⁻ + H⁺ → H₂PO₄⁻)', ['titratable acid', 'phosphate buffer', 'HPO4 buffer'],
     'Filtered phosphate buffers secreted H⁺; measured as titratable acid.')
co2 = ic.ion('co2', *CO2, 0, [B, C]); ic.S('diff', co2[0], co2[1])
ic.M('h_c', *H, C, 1); ic.M('hco3_c', *HCO3, C, 2); ic.M('hco3_b', *HCO3, B, 2)
ic.S('ca2', 'co2_c', 'hco3_c', cin=['h2o'], cout=['h'], transport=False, loc=C)
ic.M('h_l', *H, L, 1)
ic.S('hatp', 'h_c', 'h_l', cin=['atp'], cout=['adp', 'pi']); ic.S('hk', 'h_c', 'h_l')
ic.S('ae1', 'hco3_c', 'hco3_b')
kk = ic.ion('k', *K, 3, [L, C]); ic.S('hk', kk[0], kk[1])
ic.M('cl_b', *CL, B, 4); ic.M('cl_c', *CL, C, 4); ic.S('ae1', 'cl_b', 'cl_c')
ic.M('nh4_l', 'NH₄⁺', ['ammonium', 'NH4+'], L, 1, col=0, notes='Most of the acid the kidney excretes leaves as NH₄⁺.')
ic.S('trap', 'h_l', 'nh4_l', cin=['nh3'], transport=False, loc=L)
ic.M('h2po4_l', 'H₂PO₄⁻', ['dihydrogen phosphate', 'H2PO4-', 'titratable acid'], L, 2, notes='Titratable acid: the rest of the acid excreted.')
ic.S('titr', 'h_l', 'h2po4_l', cin=['hpo4'], transport=False, loc=L)
ic.out('Collecting duct: α-intercalated cell', ['α-intercalated cell', 'alpha-intercalated cell', 'intercalated cell', 'type A intercalated cell', 'acid-secreting cell'],
       'Secretes acid into the urine and returns new HCO₃⁻ to the blood. CA II makes H⁺ and HCO₃⁻ from CO₂; H⁺-ATPase (aldosterone-stimulated) and H⁺/K⁺-ATPase pump the H⁺ out, where NH₃ (trapped as NH₄⁺) and phosphate (titratable acid) buffer it; AE1 swaps the HCO₃⁻ for Cl⁻ on the blood side. Failure is distal (type 1) RTA. β-intercalated cells do the reverse (pendrin secretes HCO₃⁻ in alkalosis).',
       'kidney: collecting duct (cortex and outer medulla)',
       cofactors={'h': {'name': 'H⁺', 'aliases': ['proton', 'hydrogen ion']}, 'hpo4': {'name': 'HPO₄²⁻', 'aliases': ['phosphate', 'hydrogen phosphate', 'HPO4']}},
       distractors={'metabolites': ['Glucose (lumen)', 'Na⁺ (cell)', 'Water (blood)'], 'enzymes': [e for e in DIST_E if e not in ('H⁺-ATPase', 'AE1')]})
