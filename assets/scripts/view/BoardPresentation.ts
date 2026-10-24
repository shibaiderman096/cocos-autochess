import type { BoardPoint } from './BoardGeometry';

/** Camera-only presentation. The authored odd-r floor and simulation never change. */
export const BOARD_CAMERA = Object.freeze({ pitchDegrees: 45, distance: 10, verticalFovDegrees: 50, textureHeight: 768, defaultZoom: .84, minZoom: .64, maxZoom: .90 });
export const BOARD_PITCH_SIN = Math.sin(BOARD_CAMERA.pitchDegrees * Math.PI / 180);
export const BOARD_PITCH_COS = Math.cos(BOARD_CAMERA.pitchDegrees * Math.PI / 180);
const focalPixels = BOARD_CAMERA.textureHeight / (2 * Math.tan(BOARD_CAMERA.verticalFovDegrees * Math.PI / 360));
export function projectBoardPoint(p: BoardPoint): BoardPoint { return projectGroundPoint({x:p.x/100,y:0,z:-p.y/60}); }
/** Inverse ray/ground intersection; UI parent scaling is already removed by UITransform. */
export function unprojectBoardPoint(p: BoardPoint): BoardPoint {
  const z = -p.y * BOARD_CAMERA.distance / (focalPixels * BOARD_PITCH_SIN - p.y * BOARD_PITCH_COS);
  const depth = BOARD_CAMERA.distance - z * BOARD_PITCH_COS;
  return {x:p.x*depth/focalPixels*100,y:-z*60};
}
export function projectGroundPoint(p: {x:number;y:number;z:number}): BoardPoint {
  const depth = BOARD_CAMERA.distance - p.y*BOARD_PITCH_SIN - p.z*BOARD_PITCH_COS;
  return {x:p.x*focalPixels/depth,y:(p.y*BOARD_PITCH_COS-p.z*BOARD_PITCH_SIN)*focalPixels/depth};
}
export function clampBoardZoom(value: number): number {
  return Number.isFinite(value) ? Math.max(BOARD_CAMERA.minZoom,Math.min(BOARD_CAMERA.maxZoom,value)) : BOARD_CAMERA.defaultZoom;
}
export function wheelBoardZoom(current: number, scrollY: number): number {
  return Number.isFinite(scrollY) ? clampBoardZoom(current * Math.exp(Math.max(-120,Math.min(120,scrollY))*.001)) : clampBoardZoom(current);
}
/** Shared by the 3D module placement, reserve portraits and reserve hit rectangles. */
export function benchGroundPoint(slot: number, count: number, boardHeight: number): {x:number;y:number;z:number} {
  return {x:(slot-(count-1)/2)*.7125,y:0,z:(boardHeight/2+35)/60};
}
