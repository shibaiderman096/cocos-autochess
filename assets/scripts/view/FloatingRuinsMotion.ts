/** Presentation-only periodic functions. No engine, combat clock, random source or save data. */
export type RuinsQuality = 'high' | 'low' | 'off';
export type Triple = [number, number, number];
export type Rotation = [number, number, number, number];
export interface RuinsMotionSpec {
  name: string; kind: 'ring' | 'crystal' | 'rock'; period: number;
  amplitude: number; phase: number; direction: number; tilt: number;
  radiusX?: number; radiusZ?: number;
}
export interface RuinsPose { position: Triple; rotation: Rotation; scale: Triple }
const TAU = Math.PI * 2;
export function multiplyRotation(a: Rotation, b: Rotation): Rotation {
  const [x,y,z,w] = a, [X,Y,Z,W] = b;
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
}
export function rotatePoint(p: Triple, q: Rotation): Triple {
  const [x,y,z] = p, [a,b,c,d] = q;
  const tx=2*(b*z-c*y), ty=2*(c*x-a*z), tz=2*(a*y-b*x);
  return [x+d*tx+b*tz-c*ty,y+d*ty+c*tx-a*tz,z+d*tz+a*ty-b*tx];
}
export function motionPose(spec: RuinsMotionSpec, base: RuinsPose, seconds: number): RuinsPose {
  // Modulo bounds arguments over arbitrarily many loops; every pose starts at the captured baseline.
  const angle = TAU * (((seconds % spec.period) + spec.period) % spec.period) / spec.period;
  const wave = Math.sin(angle + spec.phase);
  let delta: Rotation = [0,0,0,1];
  const position: Triple = [base.position[0],base.position[1],base.position[2]];
  if (spec.kind === 'ring') delta=[0,Math.sin(angle*spec.direction/2),0,Math.cos(angle*spec.direction/2)];
  else {
    // Crystal lift prevents the bottom-origin meshes dipping into the static plinths.
    position[1] += (spec.kind === 'crystal' ? .12 : 0) + spec.amplitude*wave;
    if (spec.kind === 'rock') {
      const a=spec.tilt*wave/2, b=spec.tilt*Math.cos(angle+spec.phase)/2;
      delta=multiplyRotation([Math.sin(a),0,0,Math.cos(a)],[0,0,Math.sin(b),Math.cos(b)]);
    }
  }
  return {position,rotation:multiplyRotation(base.rotation,delta),scale:[...base.scale] as Triple};
}
export function crystalBreath(spec: RuinsMotionSpec, seconds: number): number {
  return .22 + .12 * (1 + Math.sin(TAU * (seconds % spec.period) / spec.period + spec.phase)) / 2;
}
/** Board-local overlay corridor, including a radius margin. The operation rectangle is untouched. */
export function overlaySafe(x: number, y: number, radius: number): boolean {
  return Math.abs(x)-radius >= 350 && Math.abs(x)+radius <= 412 && Math.abs(y)+radius <= 185;
}
