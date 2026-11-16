import * as THREE from '../vendor/three/build/three.module.js';

const frame = document.getElementById('game');
const results = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const app = () => frame.contentWindow.__fl;
const check = (name, pass, detail = '') => {
  results.push({name,pass:!!pass,detail});
  const row = document.createElement('li');
  row.className = pass ? 'ok' : 'fail';
  row.textContent = `${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`;
  document.getElementById('results').append(row);
};
async function until(fn, ms=12000) {
  const deadline = performance.now()+ms;
  while (!fn()) {
    if(performance.now()>deadline) throw new Error('Game did not become ready');
    await wait(50);
  }
}
async function freshOrbit() {
  await app().goto('orbit');
  app().orbit.begin();
  app().orbit.explore();
}
async function press(code) {
  await app().input.hold(code,200);
  await wait(30);
  await new Promise(resolve=>frame.contentWindow.requestAnimationFrame(resolve));
}
try {
  await until(() => app()?.hangar && app().scene?.id==='hangar');
  await wait(700);
  const assembly = app().hangar.assembly.instance;
  check('Seven separately installed modules', assembly.satellite.slots.size===7);
  for (const id of ['bus_micro','bus_small']) {
    const preset = id==='bus_micro' ? 'budget' : 'fastlink';
    await assembly.autoAssemble(preset);
    const bus = assembly.satellite.slots.get('bus');
    const busNode=bus.root.userData.nodes.main;
    const antenna=assembly.satellite.slots.get('antenna').root.userData.nodes.main;
    busNode.updateWorldMatrix(true,false);antenna.updateWorldMatrix(true,false);
    const inverse = busNode.matrixWorld.clone().invert();
    const local = inverse.clone().multiply(antenna.matrixWorld);
    const normal = new THREE.Vector3(0,1,0).transformDirection(local);
    const centre = new THREE.Vector3().setFromMatrixPosition(local);
    check(`${id}: antenna base faces out of the front panel`,normal.z>0.99 && centre.z> (id==='bus_micro' ? 0.3:0.5));
    const radius = id==='bus_micro' ? 0.15:0.225;
    let clear = true;
    for (const category of ['avionics','attitude']) {
      const node=assembly.satellite.slots.get(category).root.userData.nodes.main;
      node.updateWorldMatrix(true,true);
      const box=new THREE.Box3().setFromObject(node).applyMatrix4(inverse);
      const nearX=Math.min(Math.abs(box.min.x),Math.abs(box.max.x));
      const nearZ=Math.min(Math.abs(box.min.z),Math.abs(box.max.z));
      clear &&= Math.hypot(nearX,nearZ)>radius;
    }
    check(`${id}: new modules clear the instrument`,clear);
  }
  const p=app().hangar.player.get();
  await assembly.remove('avionics',{instant:true});
  await assembly.putBack({instant:true});
  app().hangar.gotoStation('rack_systems');
  app().hangar.lookAt('obc_1');
  await wait(250);
  const card=frame.contentDocument.querySelector('.part-card');
  check('New module info card contains finite figures', !!card && !card.textContent.includes('NaN'));
  await assembly.autoAssemble('fastlink');
  app().hangar.player.teleport(p.x,p.z,p.yawDeg,p.pitchDeg);
  await freshOrbit();
  let orbit=app().orbit;
  const earth=orbit.world.scene.getObjectByName('earth-terrain');
  check('Earth uses real surface, normal and elevation maps',earth.material.map.image.width===2048 && !!earth.material.normalMap && !!earth.material.displacementMap);
  check('Clouds and night lights are independent layers',!!orbit.world.scene.getObjectByName('earth-cloud-layer') && !!orbit.world.scene.getObjectByName('earth-city-lights'));
  await press('KeyV');
  check('V switches to an Earth-centred camera',orbit.camera.view==='earth');
  await press('KeyH');
  check('H hides instruments for an unobstructed view',!!frame.contentDocument.querySelector('.orbit-layout.is-cinematic'));
  await press('KeyH');
  await press('KeyP');
  await wait(150);
  check('P resumes the paused mission',!orbit.exploring);
  await press('KeyP');
  await wait(50);
  const t=orbit.state.t;
  await wait(250);
  check('P pauses simulation while leaving the view live',orbit.exploring && orbit.state.t===t);
  const event=orbit.events().find(e=>e.type==='target');
  orbit.skipTo(event.index,'smart',-1);
  orbit.setMode('IMAGE');
  await wait(1000);
  check('Imaging feedback is visible over an active target',orbit.world.beam.objects.some(o=>o.visible));
  await freshOrbit();orbit=app().orbit;
  const pass=orbit.events().find(e=>e.type==='pass');
  orbit.skipTo(pass.index,'smart',-1);orbit.setMode('DOWNLINK');
  await wait(1000);
  check('Downlink feedback is visible during a ground pass',orbit.world.link.objects.some(o=>o.visible));
  const eclipse=orbit.events().find(e=>e.type==='eclipse');
  orbit.skipTo(eclipse.index,'smart',-2);
  await wait(1000);
  check('Earth keeps its sunlit side during spacecraft eclipse',!orbit.state.sunlit && orbit.world.scene.getObjectByName('earth-sun').intensity>2);
  orbit.finish('smart');
  // Background tabs can throttle animation frames, including the short end-of-mission hold.
  await until(()=>app().scene?.id==='debrief' && !app().transitioning,45000);
  check('A full mission reaches debrief with all seven modules',frame.contentDocument.querySelector('.debrief__parts')?.children.length===7);
  await app().goto('hangar',{redesign:true});
  check('Redesign restores all seven modules',app().hangar.assembly.instance.satellite.slots.size===7);
  const memory=[{...app().renderer.info.memory}];
  for(let i=0;i<4;i++) {
    await app().goto('orbit');await app().goto('hangar');await wait(250);
    memory.push({...app().renderer.info.memory});
  }
  const baseline=memory.at(-3);
  const after=memory.at(-1);
  check('GPU resources stabilise across repeated scene visits',after.geometries<=baseline.geometries && after.textures<=baseline.textures,
    `geometry ${memory.map(m=>m.geometries).join(' → ')}, textures ${memory.map(m=>m.textures).join(' → ')}`);
} catch(error) {check('Regression runner',false,error.message);console.error(error);}
const allPass=results.every(r=>r.pass);
const summary=document.getElementById('summary');
summary.textContent=`${allPass?'ALL PASS':'FAILURES'} — ${results.filter(r=>r.pass).length} of ${results.length}`;
summary.className=allPass?'ok':'fail';
window.__visualTestResults={allPass,results};
