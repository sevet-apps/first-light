// Scene geometry of the orbit view and its link to the simulation clock. The world is a scaled-down picture:
// the Earth is a 1.5 km sphere and the satellite flies a few hundred metres above it, at the height where the
// shadow cone of the sphere reproduces the simulated eclipse (so the Sun really does set behind the limb).
import * as THREE from 'three';

export const EARTH_RADIUS = 1500;
const SUN_TILT = 0.25; // out-of-plane share of the Sun direction, so light is never exactly edge-on

/** Layout numbers derived from the mission: orbit period, eclipse centre phase, flight height above the surface. */
export function orbitGeometry(mission) {
  const { orbitMinutes, eclipseFraction } = mission.orbit;
  const halfAngle = Math.PI * eclipseFraction; // half of the shadowed arc
  const height = EARTH_RADIUS * (1 / Math.sin(halfAngle) - 1);
  return {
    orbitMinutes,
    eclipseCentre: 2 * Math.PI * (1 - eclipseFraction / 2), // the simulated eclipse is the last part of every orbit
    height,
    earthCentre: new THREE.Vector3(0, -(EARTH_RADIUS + height), 0),
  };
}

/** Orbital phase (radians) for a simulation time in minutes. */
export const phaseAt = (geo, minutes) => (2 * Math.PI * minutes) / geo.orbitMinutes;

/**
 * Unit vector towards the Sun in the satellite frame (x cross-track, y up, -z flight direction).
 * At the eclipse centre the Sun is straight down through the Earth; around the opposite phase it is overhead.
 */
export function sunDirection(geo, minutes, target = new THREE.Vector3()) {
  const delta = phaseAt(geo, minutes) - geo.eclipseCentre;
  return target.set(SUN_TILT, -Math.cos(delta), -Math.sin(delta)).normalize();
}

/**
 * Point on the Earth sphere in the spinning Earth's own frame (x cross-track, angle `along` about X from straight
 * up towards +z) for a ground feature. A feature that sits at along = -phaseAt(t) is directly below at time t.
 */
export function groundPoint(along, cross, radius = EARTH_RADIUS, target = new THREE.Vector3()) {
  return target.set(Math.sin(cross), Math.cos(cross) * Math.cos(along), Math.cos(cross) * Math.sin(along)).multiplyScalar(radius);
}

/** Cross-track angle for a window: its latitude spread over +-3 degrees, so beams and links slant a little. */
export const crossTrackOf = (window) => THREE.MathUtils.clamp(window.lat / 90, -1, 1) * THREE.MathUtils.degToRad(3);
