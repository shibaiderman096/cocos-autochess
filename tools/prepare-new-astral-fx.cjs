// Import native-alpha sheets byte-for-byte; fixed 4 x 2 cells stay registered.
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const generated = 'C:/Users/man/.codex/generated_images/01a16bee-372c-7ef3-ac33-2f9f4c1315d8';
const specs = [
  { id: 'moon_arrow_sheet', file: 'exec-c1e37740-84aa-4907-9a46-b8ffa858528d.png', reference: '月光星弦银发女神.png',
    prompts: ["Create a game-ready VFX sprite sheet ONLY, native transparent alpha background. This is the silver moon hunter's magical arrow, matching the attached character's silver white and icy lavender moon bow. No character, no bow, no environment. Exactly 4 columns and 2 rows, 8 equally-sized square cells, canvas landscape 2:1. All eight frames are the SAME arrow pointing horizontally RIGHT, centered at the exact same location in each cell, same dimensions, generous transparent padding. Clean hand-painted fantasy game VFX: a sharp luminous silver-blue arrowhead, slender white energy shaft, two delicate crescent moon arcs sweeping behind it to the left and sparse icy blue stardust. A coherent 8-frame flowing loop, the silver arrow stays fixed while the crescent wake curls and brightens then softens. Readable at 90px width, restrained glow, crisp silhouette, elegant violet blue accent. Every effect fully fits its own cell with at least 12 percent clear padding on every edge. No numbers, text, grid lines, panels, watermarks, black or colored background. True transparent pixels between sprites. Do not include any explanatory labels.",
      "Edit this 4 by 2 arrow VFX sprite sheet. Preserve exactly the same 8 arrow designs, silver lavender blue palette, right-facing direction, row order and native transparency. Shrink EACH entire arrow to 70 percent of its present size, keeping it exactly centered in its original square cell. Preserve the full canvas size, 4 columns and 2 rows. Leave generous completely transparent gutters between ALL cells and around outer edges, NO arrow or glow may touch its cell edge. Do not add any new content. Keep the arrows' silver cores and crescents sharply legible. True alpha background."],
    playback: { mode: 'one-shot', durationMs: 240, displayCells: [1.7, 1.1] } },
  { id: 'nebula_tide_sheet', file: 'exec-e9a9ab6b-e686-4170-81ce-4bb6c9167bb7.png', reference: '星环秘典：紫月星象师.png',
    prompts: ["Draw a native transparent-alpha VFX animation sheet for the attached purple-blue star mage. VFX ONLY, no character/book/scenery/text. EXACT 4 columns x 2 rows, 8 square cells on a 2:1 canvas. Each sprite is a small centered TOP-DOWN CIRCULAR magical nebula vortex, occupying ONLY 65 percent of each cell's width and height, leave 17.5 percent completely empty transparent padding all around every sprite so sprites never touch cell boundaries or one another. Eight consecutive phases of ONE smoothly looping rotating nebula: translucent wispy indigo violet and cobalt clouds swirling clockwise, tiny silver star sparkles, soft luminous lavender spiral rim, most of the middle transparent to keep a game board visible beneath. Each frame exact same pivot, diameter and scale, just clouds and sparkles evolve around the circle. Painterly high-quality fantasy game spell effect matching character illustration. Cloud ring delicate, clear silhouette when displayed at 250 pixels. Flat directly overhead circle, NOT perspective ellipses. Very subtle glow, no solid disk, no starfield background, no rectangle. Every cell centered and isolated with big clear gaps. NO grid lines or labels or numbers."],
    playback: { mode: 'loop', fps: 12, displayCellsPerRadius: [3.4, 2.1] } },
  { id: 'gravity_collapse_sheet', file: 'exec-dcc2638a-e1d5-435c-bff8-61435b498062.png', reference: '星环虚空骑士.png',
    prompts: ["Paint ONLY a fantasy black-hole spell animation sprite sheet on TRUE transparent alpha. Match the reference knight's purple-black gravitational core and thin antique-gold celestial orbital accents, no character or weapon. EXACT 4 columns and 2 rows, 8 centered circular top-down black-hole accretion rings, consecutive phases of a smooth clockwise loop. Landscape canvas 2:1; square equal cells. Each effect SMALL and fully isolated at its exact cell center, visible ring diameter only 60 percent of the square cell, huge clear transparent gutters on ALL sides. Eight same-size same-pivot frames; rotation of violet white plasma strands and orbiting rocky dust, bright violet event-horizon rim, deep indigo outer wisps. Dark center mostly transparent with only faint smoky black for a board to remain visible underneath. Restrained crisp luminous edges, hand-painted premium 2D fantasy strategy game look, readable at 300px. Flat directly overhead circle, no perspective, no scene, no floor, no sky. No starfield backdrop, no grid lines, labels, text, panels, or watermarks. Keep every whole ring and all particles away from every cell boundary."],
    playback: { mode: 'loop', fps: 12, displayCellsPerRadius: [3.4, 2.1] } },
];
const template = JSON.parse(fs.readFileSync('assets/resources/art/fx/astral_ring.png.meta', 'utf8'));
const report = [];
for (const spec of specs) {
  const source = path.join(generated, spec.file), bytes = fs.readFileSync(source);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const runtime = `assets/resources/art/fx/${spec.id}.png`;
  fs.copyFileSync(source, runtime);
  const meta = fs.existsSync(runtime + '.meta') ? JSON.parse(fs.readFileSync(runtime + '.meta', 'utf8')) :
    JSON.parse(JSON.stringify(template).replaceAll(template.uuid, crypto.randomUUID()).replaceAll('astral_ring', spec.id));
  const data = meta.subMetas.f9941.userData;
  Object.assign(data, { offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width, height, rawWidth: width, rawHeight: height, trimType: 'none', packable: false });
  Object.assign(data.vertices, { rawPosition: [-width/2,-height/2,0,width/2,-height/2,0,-width/2,height/2,0,width/2,height/2,0],
    uv: [0,height,width,height,0,0,width,0], minPos: [-width/2,-height/2,0], maxPos: [width/2,height/2,0] });
  fs.writeFileSync(runtime + '.meta', JSON.stringify(meta, null, 2) + '\n');
  report.push({ ...spec, source, runtime, width, height, columns: 4, rows: 2, frameCount: 8,
    anchor: [0.5, 0.5], alpha: 'native_alpha', art_source: 'host_image', route: 'built-in image_gen',
    model: 'not exposed', estimateUsd: null, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
fs.mkdirSync('art-source/new-astral-fx', { recursive: true });
fs.writeFileSync('art-source/new-astral-fx/provenance.json', JSON.stringify(report, null, 2) + '\n');
console.log(report.map(({ id, width, height }) => ({ id, width, height })));
