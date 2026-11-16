// Materials of the placeholder satellite parts, shared by the hangar (rack, stand) and the orbit scene.
import * as THREE from 'three';
import { detailTextures } from './detailModels.js';

const std = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Gold foil, aluminium, anodized frames, lens glass, solar cells and battery casing. */
export function createSatelliteMaterials() {
  const { foil, cells } = detailTextures();
  return {
    foil: std(0xbc8d34, 0.52, 0.55, {normalMap:foil,normalScale:new THREE.Vector2(0.24,0.24)}),
    alu: std(0xc4cbd3, 0.35, 0.55),
    aluDouble: std(0xc4cbd3, 0.35, 0.55, { side: THREE.DoubleSide }),
    anodized: std(0x7b8798, 0.4, 0.5),
    lens: std(0x0b1330, 0.1, 0.5),
    cell: std(0xffffff, 0.3, 0.4, {map:cells}),
    cellGrid: std(0xc8d0da, 0.3, 0.8),
    battery: std(0x23282f, 0.55, 0.3),
    cardboard: std(0xb59a73, 0.9),
    orange: std(0xff6a1a, 0.7),
  };
}
