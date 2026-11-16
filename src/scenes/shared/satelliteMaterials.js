// Materials of the placeholder satellite parts, shared by the hangar (rack, stand) and the orbit scene.
import * as THREE from 'three';

const std = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Gold foil, aluminium, anodized frames, lens glass, solar cells and battery casing. */
export function createSatelliteMaterials() {
  return {
    foil: std(0xe3b04c, 0.36, 0.5),
    alu: std(0xc4cbd3, 0.35, 0.55),
    aluDouble: std(0xc4cbd3, 0.35, 0.55, { side: THREE.DoubleSide }),
    anodized: std(0x7b8798, 0.4, 0.5),
    lens: std(0x0b1330, 0.1, 0.5),
    cell: std(0x142a63, 0.3, 0.4),
    cellGrid: std(0xc8d0da, 0.3, 0.8),
    battery: std(0x23282f, 0.55, 0.3),
    cardboard: std(0xb59a73, 0.9),
    orange: std(0xff6a1a, 0.7),
  };
}
