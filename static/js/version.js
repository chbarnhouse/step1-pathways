/* Version + changelog. While working, add notes to the { v: 'next' } entry at the top of CHANGELOG (create it
   if it's missing). ./release.sh turns it into the next version number with today's date and publishes.
   Each browser remembers the last version it saw; the first visit after an update shows "What's new"
   with every entry since then. Brand-new visitors get the tour instead.
   A copy built with a 'next' entry is a preview: the server copy shows a Preview badge listing what's coming. */
'use strict';

const APP_VERSION = '3.13.0';
const PUBLIC_SITE = 'https://chbarnhouse.github.io/step1-pathways/'; // the copy classmates use
const CHANGELOG = [
  { v: 'next', items: [
    'The Map’s cell: each membrane names what’s really on each side along its whole length (blood’s lower edge is blood | cytosol, blood | ER, blood | matrix in turn, instead of one name for all of it), is drawn once, and runs on to the edges of the canvas like the tints; the cytosol is one shape with no faint seams; and two pathway pieces can no longer land on each other (estradiol sat on dihydrotestosterone). A step between two boxes of one compartment gets room for its name and cofactors when that costs no more than about two extra crossings.',
    'Membranes are drawn as two colored lines side by side, each in its compartment’s color, so they no longer look like arrows; a wall between two cells is a little heavier.',
    'Zoomed in, each membrane in view gets a small pill straddling it naming the compartment on each side (“◂ Cytosol | Mitochondria ▸”), so you always know where you are (not during a quiz). These pills, and the ones where arrows leave the screen, only go where they cover nothing, and fade while you pan instead of trailing behind.',
    'Zoomed in on a connected drawing or the Map, a long arrow passing through the view with neither of its ends in it fades back to a faint line (point at it to bring it forward). One you’re following stays while it’s in view, and for 3 seconds after you pan off it; zooming starts afresh. On by default; turn it off with Fade passing arrows in the Map’s Show list or Settings → Pathway pages. Never in quizzes.',
    'Drawings look sharper: molecules have a firmer outline, enzyme names are in full ink, carriers’ pills are edged in orange and cofactors are teal, so each kind stands apart; compartment tints are stronger, in dark themes too.',
    'Hover help on drawings and the Map (not during a quiz): point at a molecule to see the other names it goes by, at an enzyme or carrier for its names and the step it does, and at an arrow for the step itself (from → to, the enzyme, the carrier, the cofactors).',
    'Zoomed in, an arrow that runs off the screen gets a small pill at the edge saying where it goes (“→ Glyceraldehyde-3-phosphate (Glycolysis + gluconeogenesis)”, “via” its carrier) or comes from; click it to go there.',
    'Connected drawings and the Map: arrows meet boxes head-on (a line that ran along just above a box and dropped a few pixels into its corner now enters its side, or drops a clear distance into it); a transporter that is a step’s name (SGLT1, GLUT2) sits on the membrane its line crosses; and the kidney’s urobilin no longer sits on top of urobilinogen with the reabsorption pill over both.',
    'The Map opens on its merged chart, the cell, by default (Each pathway whole is one click away under Layout, and remembered once picked).',
    'The Map’s merged chart places each pathway piece where its links to the rest are short and cross least, then goes over every piece again with everything else in place: on the default Map, arrows crossing arrows went from 105 to 47 and arrows cutting through another pathway from 22 to 15. Compartments (bands and the Map’s regions) leave room at their edges only for what’s shown: with enzyme names and carriers hidden, or fewer pathways on, they close up.',
    'The Map’s merged chart (Merge shared molecules) is laid out like a cell: blood across the top (gut lumen and urine at its left), the cytosol around the ER and the mitochondrial matrix, which sit side by side, the intermembrane space under the matrix, and the lysosome and vesicles as islands in the cytosol. Every two compartments with steps between them share an edge, so a step goes straight across one membrane, its carrier on it; each compartment is one region instead of many shapes; and each pathway is drawn in pieces where its steps happen, a ring still a ring. Connected drawings label their steps several times faster, so the Map draws in about 3 seconds.',
    'Drawings open the way Settings → Quizzes → Drawings open says (fit the width, the height, or the whole drawing, with Follow); zooming with + and − changes only the drawing in front of you instead of becoming the setting (a zoom saved that way before now opens as the whole drawing).',
    'Connected drawings: compartment bands run to the edges of the canvas; a step between two level boxes is one straight line; a box with steps out across a membrane and back lines up so the two don’t cross (the urea cycle’s ornithine → citrulline → argininosuccinate is a loop, not a figure 8); there’s room past each carrier for the step’s name in the compartment where its enzyme works (ornithine transcarbamylase in the matrix); and a cofactor curl beside a step’s arrow now touches the arrow.',
    'Full recall: what a step needs (B6) shows once you’ve entered it with the inputs (“Succinyl-CoA + B6”).',
    'Connected drawings are laid out compartment first: each compartment is one band across the drawing (blood, cytosol, ER, mitochondrial matrix…), each pathway sits in the bands its steps happen in, and a ring like the TCA cycle stays a ring, turned to face the membrane its steps cross. A carrier sits on the membrane it crosses (MPC between the cytosol and the matrix), a step’s name and cofactors stay in the band where its enzyme works, two steps through one carrier share one pill and fork past it, and every crossing gets a row of its own. Blood is one band whatever the tissue, and a compartment with no tissue joins the tissue it runs into (glycolysis’s cytosol is the liver cytosol beside galactose). In the 50 two-pathway drawings, labels crossing a compartment edge went from 146 to 2, with no extra shapes or tight corners.',
    'Settings is one page with a list of sections (Appearance, Quizzes, Pathway pages, Map, Presets, Your data, Help, About), and gathers settings that used to live only elsewhere: answer checking (letter checking, “Give me a letter”, the cofactor count, weak spots first, which names count; your next quiz starts with these), fed vs fasting and drugs on pathway pages, and the Map’s layout, hover and what it shows. Each section has a Reset.',
    'What a step needs (B6 for ALA synthase) is one of its input cofactors in a quiz: one field, “Succinyl-CoA + B6”, counted 0/2.',
    'Quiz fixes: changing settings on New quiz no longer jumps the sidebar back to the top (the options pop-up and facts drawer in a quiz keep their place too); Full recall and Building blocks with compartments set to Draw yourself no longer say “Quiz complete” before you’ve placed the compartments; hiding transporters closes up the nephron drawings instead of leaving gaps where their pills would go; and what a step needs (B6 for ALA synthase) no longer seems to ask for the inputs again after the outputs.',
    'Paired steps (thymidylate synthase, methionine synthase) are drawn in full at both places, each with its enzyme and the other half as its cofactors, and a matching lettered badge: hover it to see the two halves as two arrows bowing in to meet at their enzyme, click it to go to the other half. The dotted line between them is now a Map setting: Lines between paired steps.',
    'Map sidebar: Show and Browse fill the sidebar’s width, with Browse’s count on the same line. Browse finds things by any name they go by: TCA, Krebs cycle or citric acid cycle all find the TCA cycle, and a row found by another name says which (“as Krebs cycle”).',
    'Compartments in joined drawings and the Map now reach around most of their labels, so a step’s name, cofactors and carrier sit inside one compartment instead of across its edge (on the Map, 86 labels still cross an edge, down from 133; in two-pathway drawings, 166, down from 474). A step from one compartment into another keeps its name in the compartment its enzyme works in (hexokinase in the cytosol, not the blood). A molecule drawn twice now has both copies held inside their compartment.',
    'The Map opens fitted to the screen. In Browse, hovering a row lights it up and frames it; moving off lets go of the light and leaves the view where it is, and only a click keeps something lit. Light up on hover can be turned off (remembered). Faded boxes and carrier pills stay solid, so lines no longer show through them.',
    'Map compartments: holes inside a compartment are filled (the TCA cycle’s middle, gaps between cytosol pieces), nearby pieces of one compartment are joined when nothing of another lies between them, every piece big enough carries its name, and a name no longer floats in empty space away from its shape.',
    'Compartment names never sit on a line: each tries the shape’s top-left corner, along the top or turned up the left edge, then anywhere along its edges or inside it, and only covers a line when there’s no clear spot at all (on the Map, 10 sat on lines before, none now).',
    'Compartment names sit in one place: a tab at the top-left of the shape. Where a pathway steps into a new compartment the drawing leaves a little more room, so the step’s name sits above that tab instead of on it; a long name wraps to three or four lines to fit; and names of steps between pathways keep off the tab’s spot. On the Map, 35 of 39 names now sit there (18 before).',
    'Compartments in joined drawings and the merged Map now hold every one of their boxes: none sticks out of its shape or reaches into a neighbor’s (75 did on the Map).',
    'Map: switching between Each pathway whole and Merge shared molecules re-fits the view, and Chrome no longer leaves parts of the page unpainted around the big merged drawing.',
    'Two-pathway drawings start from the bigger pathway, so it keeps its own shape (fructose joins glycolysis beside its column; gluconeogenesis keeps pyruvate at the top, with room for PDH’s labels). On the Map, malate dehydrogenase is drawn once between oxaloacetate and malate, and the dotted tie for thymidylate synthase no longer crosses another step’s name.',
    'Connected drawings are tidier: nothing of one pathway lands on another’s labels, compartment names find a free spot, a step both pathways share is drawn (and asked) once, and steps between pathways show their transporter and keep their names and cofactors on a clear stretch of the line.',
    'Where one pathway’s molecule is another’s cofactor, the two are joined directly: the TCA cycle’s succinyl-CoA runs into “Succinyl-CoA + B6” at ALA synthase, folate’s N⁵-methyl-THF into methionine synthase.',
    'New: the Map (the map button by Settings). Every pathway drawn in full on one canvas, grouped in tinted bands like a wall chart, with a letter-and-number grid. A sidebar shows or hides enzymes, carriers, cofactors, vitamins, rate-limiting tags, compartments, drugs, fed vs fasting, and each pathway or whole group. Search a pathway, molecule, enzyme or drug: matches stand out, the rest fades, and a click flies you there. Hover a molecule to light up every copy of it; a tag to another pathway flies to it. Layout: each pathway whole, or merged into one chart where each shared molecule is drawn once and every pathway that uses it meets there. The sidebar’s Browse tab lists pathways, molecules, enzymes, cofactors, drugs and toxins: hover one to light it up wherever it’s drawn (the view fits it), click to keep it lit.',
    'A key on every drawing (the ? by the zoom buttons): what boxes, italic names, pills, curls, dashed lines, tags and tinted areas mean.',
    'Fed vs fasting: on a pathway page, Fed or Fasting marks each hormonally switched step ▲ ON or ▽ OFF (with why, in its facts) and fades what’s off: PFK-1, pyruvate kinase, PDH, pyruvate carboxylase, PEPCK, fructose-1,6-bisphosphatase, glucose-6-phosphatase, glycogen synthase and phosphorylase, acetyl-CoA carboxylase, CPT-I, HMG-CoA synthase and reductase. New quiz has a matching row (Show / Quiz / Hide, Fed or Fasting).',
    'Drugs & toxins: a toggle on pathway pages and a quiz row show the drugs and toxins that act on each step (⊣ blocks, ⊕ drives), from methotrexate and statins to lead, arsenic and loop diuretics, about fifty in all, and a new Library tab gives each its own page.',
    'Single drawings: ketogenesis puts acetone in the blood lane (no more crowding beside acetoacetate), nephron carrier names sit clear of the arrows and boxes, and cofactor labels never land on each other.',
    'New quiz mode, Where does it break?: a clinical vignette (an infant with lactic acidosis, a boy biting his lips…), and you click the step on the drawing that fails. About fifty classic deficiencies and poisonings, from von Gierke and OTC deficiency to lead and 21-hydroxylase.',
    'Mix-ups: answer one enzyme with another that’s easy to confuse (PEPCK and pyruvate kinase, CPS I and CPS II, glucokinase and hexokinase…) and the answer explains the difference. The app remembers the names you mix up and brings those questions back sooner.',
    'A step two pathways share from opposite sides is drawn once: with folate and methionine together, methionine synthase’s two arrows (homocysteine → methionine, N⁵-methyl-THF → THF) sit side by side, tied by a dotted line, the enzyme named and asked once; the same for thymidylate synthase with pyrimidine synthesis. Lines between pathways no longer run through labels.',
    'Compartments in joined drawings (and the Map’s merged chart) fit together like puzzle pieces: one even gutter between neighbors, and every inside corner curves around the corner it wraps; long compartment names wrap to fit.',
    'Joined drawings (and the Map’s merged chart) are much tidier: lines between pathways find a clear path instead of cutting through labels, each pathway is placed where its own lines cross nothing, names on those lines go wherever they cover nothing, compartments grow to fit their names (and are named once per area), and a carrier’s drug list sits under its pill instead of on its line.',
    'Drugs and toxins are now two Library tabs. Drugs are grouped by class (statins, loop diuretics, ACE inhibitors, antifolates…): each class has a page saying what its members share, and each drug says what sets it apart. Drawings name a class where its members act alike (“⊣ Statins”) and each drug where they differ; a quiz accepts the class or any member. New: ACE inhibitors, ARBs and NSAIDs on glomerular filtration.',
    'Filters say how they combine: two picks from one menu read “or” (either will do); for systems and tags, tap the “or” to make it “and” (pathways with all of them).',
    'List view matches the drawing: Fed/Fasting and Drugs & toxins work there too, off steps fade, links to other pathways follow their molecule, and quizzing fed vs fasting or drugs in a list no longer adds empty rows.',
    'Weak spots by kind: the Home page shows which kinds of question you miss most (enzymes, cofactors, compartments, where it breaks…), each with a Drill that asks only that kind where you missed it, and lists the names you mix up most.',
  ] },
  { v: '3.13.0', date: '2026-10-25', items: [
    'A molecule now appears once, in the compartment where it starts: no more “Glycine (mitochondria)” copies. When a step’s substrate crosses a membrane first, its transporter sits on the membrane as a pill, and the enzyme is named on the side where it acts (SLC25A38 then ALA synthase; the ALA exporter then ALA dehydratase; ORNT1 into and out of the urea cycle’s mitochondria). Terminal exports and absorption journeys (glucose out through GLUT2, galactose across the gut, the nephron) still show each place.',
    'Cycles show cofactors as a small curl on each step, inside the ring (inputs join, outputs leave), like the straight steps; rings with cofactors are drawn a little wider so the short top and bottom steps have room. Labels on crowded side steps move until they clear their neighbors.',
    'Fixed: some connected drawings failed to draw at all (gluconeogenesis or glycogenolysis with the TCA cycle, glycolysis or fructose, and three-pathway sets with the urea cycle), when one part handed a box to another.',
    'Connected drawings: a link that names a molecule one step gives off (fumarate from argininosuccinate lyase) now leaves from a dot under that label and runs with rounded corners to an arrowhead at the other pathway’s box of that name, instead of a separate tag from the neighboring box. Other dotted links get rounded corners too.',
    'A little more room around compartments and transporters (the mitochondrial pyruvate carrier no longer sits on the cytosol’s edge); a compartment that fits around another keeps an even gap, its inside corner curving with the other’s, and never leaves a stray ledge.',
    'Compartments in connected drawings are one smooth shape each: a rounded rectangle, or, where another compartment sits in its corner, one outline that fits around it, with no stepped edges. Each name tab finds a free spot.',
    'Connected pathways keep their transporters (and the Transporters row in New quiz).',
    'Every transporter’s name sits in a solid pill, so it never reads as an enzyme. Transporters are still their own Show / Quiz / Hide row, and each one has its own Library page.',
    'What a step needs (B6, biotin, B12, TPP…) now goes in with its inputs on the cofactor arrow (“Succinyl-CoA + B6 → CoA + CO₂”) instead of under the enzyme’s name, without repeating one already listed.',
    'New quiz setting: Rate-limiting enzyme (Show / Quiz / Hide), only while Enzymes isn’t hidden. On Quiz, the RATE-LIMITING tags disappear and a blank above the drawing asks which enzyme it is (StAR in steroidogenesis).',
    'The Library section for the nephron is now called Nephron (Renal stays a system filter).',
    'New quiz: with a nephron segment picked, an “All nephron segments” pill adds every segment not yet in the quiz at once (hover it to see which), in the order fluid flows. The Transporters row (Show / Quiz / Hide) now only appears when a chosen pathway has transport steps.',
    'Every membrane crossing now names its carrier (or simple diffusion), so each enzyme sits inside one compartment: Heme (glycine in through SLC25A38, ALA out to the cytosol for ALA dehydratase, coproporphyrinogen III back in through ABCB6), urea cycle (ornithine in and citrulline out through ORNT1), gluconeogenesis (pyruvate in through the mitochondrial pyruvate carrier, the malate shuttle out, glucose-6-phosphate into the ER through G6P translocase, glucose out through GLUT2), glycogenolysis, TCA cycle (pyruvate in), ketogenesis (ketone bodies out through MCT1; acetone forms in the blood), bilirubin (onto albumin, into the liver through OATP1B1/1B3, urobilinogen reabsorbed), galactose (SGLT1, GLUT2), catecholamines (tyrosine through LAT1, dopamine into vesicles through VMAT, norepinephrine out for PNMT), pyrimidines (through outer-membrane porins to DHODH) and steroidogenesis (steroids diffuse between mitochondria and ER).',
    'Diagrams: lanes run in the order the molecules travel; a box in another compartment gets its own labeled patch; side steps detour around boxes instead of running through them.',
    'New group, Nephron: the nephron, one pathway per segment. Glomerulus (filtration; albumin and red cells held back), proximal convoluted tubule, thin descending and thin ascending limbs, thick ascending limb, distal convoluted tubule, and the collecting duct’s principal and α-intercalated cells. Each is one tubular cell drawn as lumen | cell | blood, every carrier on its membrane (NHE3, SGLT2, NKCC2, ROMK, NCC, TRPV5, ENaC, aquaporin-2, H⁺-ATPase, AE1 and more), with paracellular routes, the drugs that act there and the diseases when they fail.',
    'Whole nephron: studied together, the segments draw as a textbook nephron. One continuous tubule runs from the glomerulus along the top, down the loop of Henle into a medulla shaded by depth (300 → 1200 mOsm), across the distal tubule and down the collecting duct, with each segment’s cell beside its stretch. Every segment page has a Whole nephron button.',
    'Compartments: a box’s own location now counts as a compartment, so places reached only by transport (a tubular lumen, the blood) are named and quizzable. Big drawings open at a readable zoom when Follow is on.',
  ] },
  { v: '3.12.0', date: '2026-10-20', items: [
    'Immunology: three new pathways in Blood & immunity. Helper T cell differentiation (naive CD4⁺ → Th1, Th2, Th17, Treg, Tfh: the cytokines that drive each, its master transcription factor as what it needs, and the cytokines it then makes). Cytokines (who makes each one and what it acts on, IL-1 to IL-13, IFN-γ, TNF-α, with the drugs that block them). B cell class switching (CD40L, then IFN-γ → IgG, IL-4/IL-13 → IgE, TGF-β → IgA, all needing AID). Blanks there ask for a cell or a cytokine rather than a metabolite or an enzyme.',
    'Cytokines redrawn as one network: each cell appears once, and each cytokine is an arrow from the cell that makes it to what it acts on, so the loops show (macrophage IL-12 → Th1 and NK cells, their IFN-γ → back to macrophages; Th1 and Th2 holding each other back). Th17 cells added: IL-17 draws neutrophils; IFN-γ and IL-4 hold them back; IL-6 holds back Tregs.',
    'Activates or inhibits: in Cytokines, a step that activates is a green line ending in an arrow, one that inhibits a red line ending in a flat bar (and labeled). New quiz has an Effects row (Show / Quiz / Hide) when a chosen pathway has them; Quiz asks Activates or Inhibits for each step.',
    'Helper T cell differentiation: IL-1 joins TGF-β and IL-6 in making Th17 cells; Th2 cells also make IL-6.',
    'New pathway: Hematopoiesis. One stem cell to every blood cell: the myeloid line (red cells, platelets, granulocytes, monocytes and macrophages, mast cells) and the lymphoid line (B and plasma cells, T cells and their CD4/CD8 split, NK cells), with the signal that drives each step (EPO, TPO, G-CSF, M-CSF, IL-7…) and the drugs that copy them.',
    'Library: two new tabs, Cells and Cytokines. Each cell’s page shows what it comes from and becomes, the cytokines it makes and the ones that act on it; each cytokine’s page shows which cells make it, what it acts on or holds back, and what it drives.',
    'Library and New quiz: each pathway tile shows its other names (“Also: Leloir pathway”).',
    'New quiz: Show / Quiz / Hide for each part. For compartments, Quiz then asks how: Fill in the blank, or Draw yourself.',
    'Long names in boxes wrap onto two lines instead of shrinking to tiny text.',
    'Groupings: a dashed frame with a name around related boxes. Hematopoiesis: myeloid line (granulocytes inside it) and lymphoid line. Eicosanoids: lipoxygenase branch (cysteinyl leukotrienes inside it) and cyclooxygenase branch. Complement: classical and lectin, alternative, terminal pathways. Coagulation: intrinsic, extrinsic, common pathways, and the factors thrombin activates.',
    'New quiz has a Groupings row: Show, Quiz (name each frame), or Hide. Under Quiz, Draw yourself starts with no frames: drag a frame around the boxes of each group, then name it.',
    'Editor: a Groups section. In Visual mode, the Group tool makes a group from a frame you drag around boxes; click a frame to rename it or change its boxes.',
    'Complement cascade rebuilt step by step: C1 (classical) or MBL–MASP (lectin) cuts C4 and C2 (C4a, C2a released), and C4b + C2b make the C3 convertase C4b2b. In the alternative pathway C3 breaks down on its own, and C3b with factor B (cut by factor D, Ba released) makes C3bBb. Both convertases cut C3 into C3a and C3b, and C3b joins each to make the C5 convertases. C5 is cut into C5a and C5b, which with C6–C9 forms the membrane attack complex. Current naming (C2b is the larger piece); the older C2a and C4b2a names are still accepted. Your answer history moves with it.',
    'Group frames make room for the step names inside them.',
    'Connectors: a dashed line from a box to the step it carries out (green, arrowhead), or to a box it inhibits (red, flat bar). While a step’s enzyme is a blank, its connector hides so it doesn’t give the answer away.',
    'Complement: the C3 and C5 convertases now connect to the C3 and C5 steps, so the terminal pathway joins the rest.',
    'Coagulation rebuilt as a connected cascade: XIIa activates XI, XIa activates IX, IXa with VIIIa and VIIa with tissue factor activate X, Xa with Va makes thrombin, and thrombin acts on fibrinogen, V, VIII and XIII. New: protein C and activated protein C (thrombin–thrombomodulin; inactivates Va and VIIIa), antithrombin (inhibits thrombin and Xa), and fibrinolysis (tPA: plasminogen → plasmin → fibrin degradation products, D-dimer). The common pathway is now X, V, prothrombin, fibrinogen and XIII.',
    'Coagulation laid out like the classic figure: each activation runs left to right, and each active factor sits above the next activation and drops straight onto it (XIIa → XI, XIa → IX, IXa + VIIIa → X, Xa + Va → prothrombin, thrombin → fibrinogen). Factor X appears twice so the extrinsic pathway (VIIa) comes in from the right. VIII and VIIIa now sit in the intrinsic frame.',
    'Editor: each step has “Carried out by” (the boxes whose connector lands on it) and each box has “Inhibits”. Connectors show as dashed lines on the Visual canvas too.',
  ] },
  { v: '3.11.1', date: '2026-10-20', items: [
    'The first-visit notice adds one more box: Step 1 Pathways is provided as is, with no guarantee that it’s accurate or bug-free, and you use it at your own risk. If you’ve already accepted the notice, you’ll see just this box once.',
  ] },
  { v: '3.11.0', date: '2026-10-19', items: [
    'Two new pathways in a new group, Blood & immunity. Coagulation cascade: intrinsic (XII → XI → IX), extrinsic (tissue factor + VII) and common (X → thrombin → fibrin → cross-linked fibrin) pathways, with thrombin’s feedback on V, VIII and XIII; what needs Ca²⁺ and phospholipid; notes on PT/PTT, hemophilias, factor V Leiden, vitamin K and the anticoagulants. Complement cascade: classical, lectin and alternative pathways to the C3 and C5 convertases and the membrane attack complex, with C3a/C5a and the deficiencies (C1 inhibitor, C3, C5–C9, DAF/CD59).',
    'New way to study: Review. Every answer is shown on the diagram (connected pathways together, on one drawing) and nothing is asked; click anything for its facts. Show/Hide still works per kind. “Quiz me on this” switches to Fill the blanks on the same pathways, and reviews appear in Activity.',
    'Each metabolite, enzyme and cofactor page now shows it in its pathways: every pathway it’s in is drawn zoomed to its steps, with it outlined heavy and its name bold and underlined while the rest fades back (Study and Open pathway beside each). Above: At a glance (other names, where, rate-limiting, what it needs, cofactors, made by / used by, connected pathways, your answers) and notes. The full table of steps is one click away.',
    'Breadcrumbs: the Library pages and pathway pages show the way you came (Library › Enzymes › ALA synthase › …), each a link; going back trims it.',
    'The Metabolites, Enzymes and Cofactors tabs work like Pathways: rows by section (enzymes by kind, e.g. kinases, dehydrogenases, synthases; metabolites by pathway group; cofactors by what they do, e.g. vitamins, electron carriers, group carriers), a sort menu (in most pathways, weakest first, recently studied), and Kind, System, Pathway, Status and Tags filters. Tiles show your accuracy and body systems.',
    'Library tabs: Metabolites, Enzymes and Cofactors beside Pathways. Search any of them (other names count), and open one for a page of its own: its names, notes from each pathway, and every step it’s part of, with links to the pathway and to each enzyme, metabolite and cofactor. Metabolites show what makes them and what uses them; cofactors show where they go in, come out, or are needed (vitamins, one page per B-number).',
    'New quiz from the top bar (or the dashboard card) starts with no pathway picked, and says to select one; Clear all empties the picks. How you study stays as you left it. Every picked pathway’s tile is marked in the grid.',
    'New quiz: every pathway in the quiz is an equal pill (× takes it out). Below, Add a connected pathway suggests what links to all of them, most closely related first; gluconeogenesis appears there for glycolysis and turns on the combined view.',
    'The first-visit notice adds one more box to tick: the pathways were largely written with an AI model, so occasional errors are possible. If you already accepted the notice, you’ll see just this part once.',
    'Quiz connected pathways together on one diagram. In New quiz, under the pathway you picked, Connected pathways offers what links to it: pick Glycolysis, add TCA cycle, and β-oxidation, heme synthesis, the urea cycle and more become available. Each keeps its own layout; a molecule they share is one box; compartments are drawn once for the whole picture; the same molecule in two compartments (cytosolic and mitochondrial pyruvate) is joined by a transport arrow. Answers count toward each pathway on its own.',
    'Connected quizzes draw a molecule once even when it sits mid-pathway in both: in Glycolysis + gluconeogenesis with the TCA cycle, oxaloacetate is one box, with pyruvate carboxylase and PEP carboxykinase pointing into the TCA ring’s. Arrows between pathways no longer run along each other.',
    'Cycle arrows reach their boxes (the folate cycle’s left a gap), and a step’s full label (name, RATE-LIMITING, what it needs) is kept clear of the steps around it (glycolysis + gluconeogenesis: PEP carboxykinase’s GDP + CO₂ no longer sits on pyruvate carboxylase).',
    'Six new pathways: Methionine cycle (with transsulfuration to cysteine), Folate cycle (SHMT, thymidylate synthase, DHFR, MTHFR), Heme degradation (bilirubin, from macrophage to gut and urine), Purine salvage and degradation (HGPRT, APRT, ADA, xanthine oxidase), Sphingolipid degradation (the lysosomal storage diseases), and Eicosanoids (COX and 5-LOX).',
    'TCA cycle starts at pyruvate: pyruvate dehydrogenase (NAD⁺ + CoA → NADH + CO₂; needs TPP, lipoic acid and FAD) makes the acetyl-CoA that enters at citrate synthase.',
    'What a step needs is quizzed with the cofactors: with Cofactors set to Quiz, a “needs” blank sits under the enzyme. Any usual name counts (B6, vitamin B6, PLP, pyridoxal phosphate, pyridoxine; TPP or thiamine for B1), and several lock in one at a time in any order.',
    'Vitamins and other helpers a step needs show under its enzyme: “needs B6 (pyridoxal phosphate)” for ALA synthase, “needs Biotin (B7)” for the carboxylases, TPP, lipoic acid and FAD for pyruvate and α-ketoglutarate dehydrogenase (24 steps in 14 pathways).',
    'Cleaner cycle diagrams: side branches sit beside the ring instead of on top of it, and connectors route around boxes rather than through them.',
  ] },
  { v: '3.10.1', date: '2026-10-19', items: [
    'Steroidogenesis: cortisol ⇄ cortisone. 11β-HSD2 (kidney, colon, salivary glands, placenta; NAD⁺ → NADH) inactivates cortisol; 11β-HSD1 (liver, adipose, brain; NADPH → NADP⁺) reactivates it. Notes cover licorice and apparent mineralocorticoid excess.',
  ] },
  { v: '3.10.0', date: '2026-10-18', items: [
    'Diagrams use right-angle connectors instead of slanted lines: steps that cross a membrane go down, across and down; side steps and extra products turn at right angles into their boxes.',
    'Activity: every session (older ones too) has ▶ to run that quiz again and a star to add it to favorites.',
    'Library: applied filters are solid chips the same size as the filter menus; the sort menu matches the search bar; “combines with …” is now a link icon with the details on hover.',
    'Cleaner diagrams: glycogenolysis shows the debranching enzyme’s glucose in the cytosol (separate from the glucose glucose-6-phosphatase makes in the ER), gluconeogenesis runs mitochondria → cytosol → ER left to right, cholesterol synthesis no longer zigzags (mevalonate is cytosolic), side branches run down their own column (pyrimidines, purines, fatty acid synthesis), and labels keep clear of boxes, compartment regions and each other.',
    'Every pathway is tagged by body system (Fundamentals, Skin, MSK, Neuro, Cardio, Renal, Endo/Repro, Heme, GI) plus a few study tags (Fed state, Fasting, Energy, Storage, Amino acids, Drug targets, Vitamins). Filter the Library and New quiz by them; your own tags still work alongside.',
    'Library and New quiz filters are tidier: one menu each for Group, System, Status and Tags; what’s on shows as chips you can remove with ×.',
    'Pathways show where they connect to others: a dotted line to a tag like “→ TCA cycle” or “from Glycolysis”. On a pathway page, click the tag to open that pathway. In a quiz a tag appears once its box is answered.',
    'Activity on the dashboard: each session has ▶ to run that quiz again and a star to add it to your favorites.',
    'When a quiz is done, a summary pops up: your score, time, and anything to look at again, with Go again, Change settings (opens New quiz with this quiz loaded), Review facts, and the same quiz on any connected pathway.',
    'New pathway: VOMIT (propionyl-CoA → succinyl-CoA). Valine, Odd-chain fatty acids, Methionine, Isoleucine and Threonine feed propionyl-CoA; then propionyl-CoA carboxylase (biotin), methylmalonyl-CoA epimerase and methylmalonyl-CoA mutase (B12).',
  ] },
  { v: '3.9.0', date: '2026-10-18', items: [
    'New quiz: hover over Show, Quiz, Place or Hide to see what each one does.',
    'Compartments have a fourth choice, Place: no compartment colors or names; you click between steps wherever the pathway crosses a membrane, check, then name each part (“mito” counts as your name settings allow). In Fill the blanks it comes first; in Full recall and Building blocks, after you’ve rebuilt the pathway; on its own it’s the whole quiz. Steps that carry something across a membrane are marked as crossings for you.',
    'Cofactors: what goes in comes before what comes out (ATP, then ADP), but within each side any order counts (ATP and NADH, or NADH and ATP). Letter checking and hints follow the order you chose.',
    'New options under Advanced: submit right answers automatically (no Return needed, cofactors included), and show how many cofactors a step has (“1/2” while you type).',
    'Letter checking highlights runs of letters as one smooth band.',
    'Check each letter understands cofactors: any of a cofactor’s names counts (NAD or NAD⁺, Pi or phosphate), in any order within a side; it turns red only for a cofactor that doesn’t belong or comes too early.',
    'New option under Advanced: Require full names, so abbreviations like “Gly”, “PFK-1” or “mito” don’t count.',
    'On the diagram canvas, compartment colors and membranes reach the edges of the canvas, and the typing box blends into the shape you’re filling in.',
    'Cofactors can be separated any way you like, or not at all: “ATP, ADP”, “ATP ADP”, “ATP + ADP” and “ATPADP” all count.',
    'Dashboard: Favorites and Presets side by side. Clicking either opens New quiz with it loaded so you can adjust it first; ▶ on a favorite starts it right away.',
    'More spellings count: an enzyme named after a metabolite accepts any of that metabolite’s names (ALA synthase, δ-ALA synthase, δ-aminolevulinic acid synthase, 5-aminolevulinate synthase), “-ic acid” or “-ate”, and Greek letters as symbols or words.',
    'Every element now has full names and nicknames. The answer panel lists both (“Also called” and “Sometimes written as”), whatever your settings, and the editor has a field for each.',
    'New setting, Which names count: for full names (“δ-aminolevulinic acid synthase”), common abbreviations (“ALA synthase”, “mito”) and any abbreviation (“ALAS”, “PFK-1”), choose Auto-accept (counts as soon as it’s typed), On Enter, or Don’t accept. By default full names auto-accept and abbreviations count on Enter. A name that isn’t accepted isn’t a miss: you’re asked for a fuller one, with a button to enable abbreviations. This replaces Require full names and Submit automatically.',
    'Check each letter shows which kind of name you’re typing: green with a solid underline (counts by itself), gold with a dotted underline (counts on Enter), red with a wavy underline (not accepted, or a typo).',
    'Cofactors lock in one at a time: type “CoA” and it turns green (1/2) while you type the next; the blank is done when the last one is in. Backspace in an empty field takes the last one back.',
    'Cofactor blanks sit on the same curved arrow as the answers (in at the top, out at the bottom), and check marks no longer crowd compartment names or the arrow.',
    'A small “Right” or “Not quite” badge appears beside the blank you just answered, and in Building blocks a notice says when a round is done and the quiz goes back to the top.',
    'Show facts / Hide facts button in the bottom bar.',
    'Cofactors on sideways steps and steps across a membrane also get the curved arrow, bowing in toward the step.',
    '“Cytoplasm” checks letter by letter as a full name for the cytosol (it was already accepted), and “cyto” counts as a common abbreviation, like “mito”.',
    'Cofactors on one side of a step read as just the molecules: “→ H₂O” instead of “releases H₂O”, “ATP →” instead of “uses ATP”.',
    'With “Show how many cofactors there are” off, a step’s cofactors show as one blank until you say which arrow it has (in and out, in only, out only; keys 1–3). A wrong pick costs the first try.',
    'With Follow on, a button above it (eye icon) shows the whole pathway while you hold it; let go and you’re back where you were.',
    'Building blocks starts with the first two blanks (1, 2 · 1, 2, 3 · …), so the first one isn’t typed twice in a row.',
    'Cofactors that go in and cofactors that come out are now two separate blanks (“cofactors in → out”), each answered in any order.',
    'The answer panel no longer gives away what you haven’t answered yet (including cofactors and compartments mentioned in the notes): those parts are covered until you click them.',
    'Quiz top bar: Step back (undo the last answer, which is asked again and not counted twice) and Restart.',
    'Blank shapes on the diagram are filled white.',
    'Dashboard: Favorites fills its space beside Presets, and favorites can be renamed (pencil button).',
    'Canvas controls: labels appear when you hover over them; new Fit height; Fit all turns off Follow (so the whole diagram stays in view); clicking the zoom percentage returns to 100%.',
  ] },
  { v: '3.8.1', date: '2026-10-18', items: [
    'Clear all history (Settings) now really starts over: everything saved here is erased, after an offer to download a backup first, and the app opens as on your first visit.',
  ] },
  { v: '3.8.0', date: '2026-10-18', items: [
    'Diagrams are now a canvas: drag to move around, pinch (or Ctrl/⌘ and scroll) to zoom. The typing box stays on its spot at any zoom, in every browser.',
    'Clearer compartments: each has its own tint with its name on a tab, membranes are dashed, and a step that happens somewhere else (glucose in the blood, pyruvate carboxylase in the mitochondria) gets its own labeled box.',
    'Blanks say what goes there: metabolite, enzyme, transporter, cofactors or compartment.',
    '“Give me a letter”: also press → at the end of your answer. The letter is filled in for you and never marked right or wrong. Check each letter now highlights right letters in green and wrong ones in red.',
    'In a quiz: step through the facts with Back and Next (or ← →), a progress bar, and the favorite star and edit pencil next to the title.',
    'New quiz: each mode explains how it works and what it’s best for, what to show, quiz or hide comes first, and answering options are under Advanced. Building blocks hides blanks you haven’t reached yet.',
    'Library and New quiz show each group as a row you can scroll sideways. Glycolysis and gluconeogenesis each have a “Study with…” button instead of a third, combined pathway.',
    'Share a pathway you built or edited: Share with classmates on its page. Approved pathways appear for everyone under Shared by classmates, with your name on them.',
    'A visual pathway editor: drag boxes, drag between boxes to add a step, and undo. Edited fields on a built-in pathway can each be reverted.',
    'Appearance in Settings: Auto, Light or Dark, with a choice of Default (blue) or Light, and Dark or Black.',
    'Your progress is protected across updates, and the first-visit notice walks you through setting up a backup file.',
    'Simpler top bar, with Settings and Help (tour, what’s new, report a problem) on the right, one typeface throughout, and every diagram checked so no labels overlap.',
  ] },
  { v: '3.7.0', date: '2026-10-17', items: [
    'Report a problem: describe a bug, a fact that looks wrong, or a suggestion from the Report button at the top. It opens a Google Form with your report filled in; sign in with Google and press Submit. Reports are private.',
  ] },
  { v: '3.6.0', date: '2026-10-17', items: [
    'Automatic backups. In Chrome or Edge, link a backup file in Settings and every change is saved to it. In any browser, turn on a backup download each time you leave a quiz.',
    'What’s new: after an update, this window shows what changed.',
  ] },
  { v: '3.5.0', date: '2026-10-17', items: [
    'A clear notice that progress is saved only in your browser, with an offer to back up when you leave a quiz.',
    'Pathways that can be studied together now say “combines with…”.',
  ] },
  { v: '3.4.0', date: '2026-10-17', items: [
    'Favorites: star any quiz to start it from the dashboard in one click.',
    'Renamed to Step 1 Pathways.',
  ] },
  { v: '3.3.0', date: '2026-10-17', items: [
    'Guided tour for first-time visitors (the Tour button brings it back).',
    'Activity log on the dashboard: what you studied, when, how, and how it went.',
    'The urea cycle shows which step happens in the mitochondria.',
  ] },
  { v: '3.2.0', date: '2026-10-17', items: [
    'Building blocks mode: one blank, then two, then three… from the top, until you can type the whole pathway.',
    'Compartments can be quizzed in every mode.',
    'Search, filter, sort and tag pathways.',
  ] },
];
const PENDING = CHANGELOG.filter(e => e.v === 'next'), RELEASED = CHANGELOG.filter(e => e.v !== 'next');
const isPreview = () => PENDING.some(e => e.items.length);
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function changelogHTML(entries) {
  return entries.map(e => `<div class="cl-entry"><div class="cl-h"><b>${e.v === 'next' ? 'Not released yet' : 'Version ' + esc(e.v)}</b><span class="muted small">${e.v === 'next' ? 'only on your copy' : new Date(e.date + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
    <ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
}
function showChangelog(entries = RELEASED, title = 'What’s new') {
  return ask({ title, html: `<div class="changelog">${changelogHTML(entries)}</div>`, ok: 'Got it', cancel: null });
}
// Called once on boot (after the tour / data notice). hadData = this browser was used before versions existed.
async function announceUpdate(hadData) {
  const seen = local.get('pathways.seenVersion');
  local.set('pathways.seenVersion', APP_VERSION);
  if (!seen) { if (hadData) await showChangelog(RELEASED.slice(0, 1)); return; }
  const fresh = RELEASED.filter(e => cmpVer(e.v, seen) > 0);
  if (fresh.length) await showChangelog(fresh);
}
// The self-hosted copy runs whatever is on the dev branch; when that includes unreleased changes, say so.
function previewBadge() {
  const b = $('#previewBadge');
  if (!b) return;
  b.hidden = !(Store.mode === 'server' && isPreview());
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-preview]')) showChangelog(PENDING, 'Preview: not released yet');
  const c = e.target.closest('[data-copy-public]');
  if (c) navigator.clipboard.writeText(PUBLIC_SITE).then(() => toast('Link copied'), () => toast(PUBLIC_SITE));
});
