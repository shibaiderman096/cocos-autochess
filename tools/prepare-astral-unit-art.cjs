// Copy native-alpha generation without changing pixels; preserve UUIDs on repeat runs.
const fs=require('fs'),crypto=require('crypto');
const specs=[
  {
    "id": "stellar_barrier",
    "ref": "C:/Users/man/Downloads/星穹圣铠·天文骑士.png",
    "prompt": "Create ONE production ready 2D fantasy game VFX sprite on genuine transparent background, native alpha. The attached image is STYLE AND PALETTE REFERENCE ONLY, do not redraw or include the knight. Subject: a celestial shield barrier, a hollow softly luminous indigo and sapphire oval shell with thin ornate gold star-iron rim and four bright four-point stars, a tiny white-blue stellar spark at its top. The center MUST be mostly transparent so the game character remains clearly visible through it. Delicate constellation threads embedded only around the perimeter, rounded shell, tasteful lavender and cyan rim light, gold filigree matching the reference. Front view centered, full entire effect inside canvas with generous 12% transparent margin, no ground, no background galaxy rectangle, no character, no text, no labels, no grid, no checkerboard painting, no opaque black, no watermark. Clear readable simple silhouette at 96 pixels high, high quality hand painted game effects, soft translucent outer glow, strong alpha falloff.",
    "file": "C:/Users/man/.codex/generated_images/01a16366-79b8-72e1-a064-cd68a9f95a8d/exec-19a64304-775a-4e46-8a89-1aac314ff3aa.png"
  },
  {
    "id": "stellar_rush",
    "ref": "C:/Users/man/Downloads/星穹圣铠·天文骑士.png",
    "prompt": "Create ONE production ready 2D fantasy game VFX sprite on genuine transparent background, native alpha. Attached knight is STYLE AND PALETTE REFERENCE ONLY; no character or equipment. A horizontal celestial charge trail traveling LEFT TO RIGHT: a bright pointed blue-white comet head at right of center with a few sharp gold star fragments, trailing three fluid sapphire and indigo streaks toward the left, sparse four-point stellar sparks. Gold edges, cyan core, tiny violet glow, confident broad clean brush shapes, no ring. Horizontal effect occupies middle half of canvas vertically, no other objects. FULL effect visible with generous 12% transparent margin on all sides; fading alpha tail. Readable at 100x40 pixels. No environment, no ground, no opaque black, no checkerboard painting, no text, no character, no arrows, no grid. High quality fantasy game spell artwork.",
    "file": "C:/Users/man/.codex/generated_images/01a16366-79b8-72e1-a064-cd68a9f95a8d/exec-a101989e-7197-43bc-b89d-a8c80a577b16.png"
  },
  {
    "id": "milu_star_trail",
    "ref": "C:/Users/man/Downloads/星辉流光九尾灵狐.png",
    "prompt": "Create ONE production ready 2D fantasy game VFX sprite on genuine transparent background, native alpha. The attached fox is STYLE AND PALETTE REFERENCE ONLY; no animal, face, body, legs or equipment. A horizontal comet leap afterimage traveling LEFT TO RIGHT: three elegant long intertwining ribbons of star dust like flowing fox tails, pearlescent white, lavender, icy lilac and deep sapphire, gently sweeping upward at the right, their left ends taper and fade into small four-point starlight. One small brilliant white-lilac diamond star near the right head. Fine gold accents very sparse. Full effect inside canvas with generous 12% transparent margin; long low profile, graceful curved luminous ribbon shapes; limited sparks so readable at 100x45 pixels. No galaxy background, no environment, no ground, no opaque black, no checkerboard painting, no text, no grid. High quality hand-painted magical game effect.",
    "file": "C:/Users/man/.codex/generated_images/01a16366-79b8-72e1-a064-cd68a9f95a8d/exec-0fcdee27-0114-4372-bb5b-af4bf56ddc7d.png"
  },
  {
    "id": "milu_star_impact",
    "ref": "C:/Users/man/Downloads/星辉流光九尾灵狐.png",
    "prompt": "Create ONE production ready 2D fantasy game VFX sprite on genuine transparent background, native alpha. The attached fox is STYLE AND PALETTE REFERENCE ONLY, no creature or body. A compact celestial magic hit burst: a crystalline four-point diamond star flaring in luminous white, pale lavender and icy blue, surrounded by a loose curling crescent of violet star sand and 6 small sparkling star shards. Fine subtle gold rims. Symmetric central clear hit silhouette with a few elegant uneven tendrils, soft translucent glow feathering completely to alpha, hollow spaces between arms. Must read clearly at 70 pixels. Center effect with generous 15% transparent margins and no cutoff. No physical floor or ground, no large shockwave ring suggesting area damage, no environment, no opaque black, no checkerboard painting, no text, no characters, no grid. High quality hand painted game spell impact.",
    "file": "C:/Users/man/.codex/generated_images/01a16366-79b8-72e1-a064-cd68a9f95a8d/exec-c88b7857-20a0-46db-808d-16a8233dae84.png"
  }
];
const template=JSON.parse(fs.readFileSync('assets/resources/art/fx/astral_ring.png.meta','utf8')),report=[];
for(const spec of specs){
 const b=fs.readFileSync(spec.file),w=b.readUInt32BE(16),h=b.readUInt32BE(20),name=spec.id;
 const source='art-source/astral-unit-fx/'+name+'-source.png',file='assets/resources/art/fx/'+name+'.png';
 fs.copyFileSync(spec.file,source);fs.copyFileSync(spec.file,file);
 const m=fs.existsSync(file+'.meta')?JSON.parse(fs.readFileSync(file+'.meta','utf8')):
  JSON.parse(JSON.stringify(template).replaceAll(template.uuid,crypto.randomUUID()).replaceAll('astral_ring',name));
 const d=m.subMetas.f9941.userData;Object.assign(d,{offsetX:0,offsetY:0,trimX:0,trimY:0,width:w,height:h,rawWidth:w,rawHeight:h,trimType:'none',packable:false});
 Object.assign(d.vertices,{rawPosition:[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],uv:[0,h,w,h,0,0,w,0],minPos:[-w/2,-h/2,0],maxPos:[w/2,h/2,0]});
 fs.writeFileSync(file+'.meta',JSON.stringify(m,null,2)+'\n');
 report.push({...spec,art_source:'host_image',route:'built-in image_gen',model:'not exposed',estimateUsd:null,width:w,height:h,source,runtime:file,sha256:crypto.createHash('sha256').update(b).digest('hex')});
}
fs.writeFileSync('art-source/astral-unit-fx/provenance.json',JSON.stringify(report,null,2)+'\n');console.log(report.map(r=>({id:r.id,width:r.width,height:r.height})));
