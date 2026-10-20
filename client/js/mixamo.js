// Motion-captured rifle animations (Mixamo), applied to the game's own caricature characters.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const BASE = 'vendor/models/';
const ANIMS = ['idle', 'walk', 'run', 'back', 'left', 'right', 'jump', 'death1', 'death2', 'hit'];

// Mixamo rigs vary in their bone prefix ("mixamorig", "mixamorig1", "mixamorig:", "mixamorig12:"...). Normalize.
const canon = (n) => n.replace(/^mixamorig\d*[:_]?/, 'mixamorig');
const clips = {};
let ready = false;
let loading = null;

export const mixamoReady = () => ready;

export let skeletonTemplate = null;
export function loadMixamo(base = BASE) {
  if (loading) return loading;
  loading = (async () => {
    const fb = new FBXLoader();
    const anims = await Promise.all(ANIMS.map((a) => fb.loadAsync(`${base}anims/${a}.fbx`).then((f) => [a, f]).catch(() => [a, null])));
    for (const [a, f] of anims) {
      if (!f || !f.animations[0]) continue;
      if (a === 'idle') {
        f.traverse((o) => { if (o.isBone) o.name = canon(o.name); });
        f.scale.setScalar(0.01); // Mixamo FBX is in centimetres
        skeletonTemplate = f;
      }
      const c = f.animations[0];
      c.name = a;
      for (const t of c.tracks) { const i = t.name.lastIndexOf('.'); t.name = canon(t.name.slice(0, i)) + t.name.slice(i); }
      // keep the vertical bob from the mocap, drop horizontal drift (movement comes from the game)
      for (const t of c.tracks) {
        if (/Hips\.position$/.test(t.name) && !/death|hit/.test(a)) {
          const v = t.values, x0 = v[0], z0 = v[2];
          for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
        }
      }
      clips[a] = c;
    }
    ready = !!skeletonTemplate && !!clips.walk && !!clips.run;
    return ready;
  })();
  return loading;
}
export const mixamoClips = clips;

/**
 * Advance a realistic character.
 * lv: local velocity { f: forward m/s, r: right m/s }, air: true while jumping/falling.
 */
export function updateMixamo(rig, dt, lv, alive, pitch, air) {
  const { actions } = rig;
  if (!alive) {
    if (!rig.dead) {
      rig.dead = true;
      for (const k of Object.keys(rig.w)) actions[k]?.fadeOut(0.15);
      rig.deathAct = actions[Math.random() < 0.5 ? 'death1' : 'death2'] || actions.death1;
      rig.deathAct?.reset().fadeIn(0.1).play();
    }
    rig.mixer.update(dt);
    return;
  }
  if (rig.dead) {
    rig.dead = false;
    rig.deathAct?.fadeOut(0.1);
    for (const k of Object.keys(rig.w)) { actions[k]?.reset().play(); actions[k]?.setEffectiveWeight(k === 'idle' ? 1 : 0); }
  }
  // target blend weights from local velocity
  const sp = Math.hypot(lv.f, lv.r);
  const t = { idle: 0, walk: 0, run: 0, back: 0, left: 0, right: 0 };
  if (sp < 0.5) t.idle = 1;
  else {
    const move = Math.min(1, (sp - 0.5) / 1.5);
    t.idle = 1 - move;
    const nf = lv.f / sp, nr = lv.r / sp;
    const fwd = Math.max(0, nf), bwd = Math.max(0, -nf), side = Math.abs(nr);
    const sum = fwd + bwd + side || 1;
    const runK = Math.min(1, Math.max(0, (sp - 6.5) / 2));
    t.walk = move * (fwd / sum) * (1 - runK);
    t.run = move * (fwd / sum) * runK;
    t.back = move * (bwd / sum);
    if (nr > 0) t.right = move * (side / sum); else t.left = move * (side / sum);
  }
  const k = Math.min(1, dt * 10);
  for (const n of Object.keys(t)) {
    rig.w[n] += (t[n] - rig.w[n]) * k;
    actions[n]?.setEffectiveWeight(rig.w[n]);
  }
  const rate = Math.max(0.7, Math.min(1.5, sp / 4));
  for (const n of ['walk', 'back', 'left', 'right']) actions[n]?.setEffectiveTimeScale(rate);
  if (air && rig.jumping <= 0 && actions.jump) { actions.jump.reset().setEffectiveWeight(0.8).play(); rig.jumping = 0.8; }
  rig.jumping -= dt;
  rig.mixer.update(dt);
  // aim the upper body up/down after the animation pose is applied
  if (rig.bones.Spine2) rig.bones.Spine2.rotation.x += -pitch * 0.6;
  if (rig.bones.Spine1) rig.bones.Spine1.rotation.x += -pitch * 0.3;
  if (rig.placeGun) rig.placeGun(pitch);
}

export function hitMixamo(rig) {
  const a = rig.actions.hit;
  if (!a || rig.dead) return;
  a.reset().setEffectiveWeight(0.6).fadeIn(0.05).play();
}
