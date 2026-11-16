import { AudioManager } from '../src/core/audio.js';

const PARAMS = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
const EXPECTED = [4, 5, 6, -0.6, -0.8, 0, 0, 0, 1];
const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 0, 1, 0, 0.6, 0.8, 0, 0, 4, 5, 6, 1] } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function runAudioTests() {
  const results = [];
  const check = (name, run) => {
    try {
      results.push({ name, pass: !!run(), detail: '' });
    } catch (error) {
      results.push({ name, pass: false, detail: error.message });
    }
  };
  const update = (listener, view = camera) => AudioManager.prototype.setListener.call({ ctx: { listener } }, view);

  check('Modern AudioParams follow the camera position and orientation', () => {
    const listener = Object.fromEntries(PARAMS.map((key) => [key, { value: 0 }]));
    update(listener);
    return same(PARAMS.map((key) => listener[key].value), EXPECTED);
  });
  check('Firefox legacy listener follows the same camera without stopping rendering', () => {
    let position;
    let orientation;
    const listener = {
      setPosition(...value) { position = value; },
      setOrientation(...value) { orientation = value; },
    };
    update(listener);
    update(listener); // updates run every animation frame, not just on scene entry
    return same(position, EXPECTED.slice(0, 3)) && same(orientation, EXPECTED.slice(3));
  });
  check('Position and orientation support are detected independently', () => {
    let orientation;
    const listener = {
      positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 },
      setOrientation(...value) { orientation = value; },
    };
    update(listener);
    return same([listener.positionX.value, listener.positionY.value, listener.positionZ.value], EXPECTED.slice(0, 3))
      && same(orientation, EXPECTED.slice(3));
  });
  check('Unavailable spatial audio does not stop the game', () => {
    update({});
    update({}, null);
    AudioManager.prototype.setListener.call({ ctx: null }, camera);
    return true;
  });
  return { allPass: results.every((r) => r.pass), results };
}
