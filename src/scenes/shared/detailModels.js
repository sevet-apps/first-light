// Authored in Blender; the asset cache owns the originals across scene changes.
let source = null;
let bounds = [];
let textures = {};

export async function prepareDetailModels({ assets }) {
  const [model, foil, cells] = await Promise.all([
    assets.gltf('assets/models/flight_details.glb'),
    assets.texture('assets/textures/satellite/foil-normal.png',{srgb:false}),
    assets.texture('assets/textures/satellite/solar-cells.png'),
  ]);
  source = model.scene;
  textures = { foil, cells };
  source.updateMatrixWorld(true);
  bounds = [];
  source.traverse((o) => {
    if (!o.name.startsWith('COL_') || !o.isMesh) return;
    o.geometry.computeBoundingBox();
    const box = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    bounds.push({id:o.name,shape:'box',x:(box.min.x+box.max.x)/2,z:(box.min.z+box.max.z)/2,
      w:box.max.x-box.min.x,d:box.max.z-box.min.z,h:box.max.y,yawDeg:0});
    o.visible = false;
  });
}

export const detailColliders = () => bounds;
export const detailTextures = () => textures;

export function detailModel(name, uniqueGeometry = false) {
  const original = source?.getObjectByName(name);
  if (!original) throw new Error(`Missing detail model: ${name}`);
  const model = original.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (uniqueGeometry) {
      o.geometry = o.geometry.clone();
      o.geometry.userData.shared = false;
    }
  });
  return model;
}
