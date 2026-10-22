const fs=require('node:fs');
function readGlb(file){
 const bytes=fs.readFileSync(file);if(bytes.toString('ascii',0,4)!=='glTF')throw Error('Invalid GLB');
 const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length)),bin=bytes.subarray(28+length);
 function attribute(index){const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},size=sizes[a.type],width={5126:4,5125:4,5123:2,5121:1}[a.componentType];
  const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*width;
  return Array.from({length:a.count},(_,i)=>Array.from({length:size},(_,k)=>{const p=start+i*stride+k*width;return a.componentType===5126?bin.readFloatLE(p):a.componentType===5125?bin.readUInt32LE(p):a.componentType===5123?bin.readUInt16LE(p):bin.readUInt8(p);}));}
 function vertices(n){return n.mesh===undefined?[]:gltf.meshes[n.mesh].primitives.flatMap(p=>attribute(p.attributes.POSITION));}
 return {gltf,bin,bytes,attribute,vertices};
}
module.exports={readGlb};
