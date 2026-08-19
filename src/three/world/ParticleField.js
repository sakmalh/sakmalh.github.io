import {
  AdditiveBlending,
  BufferGeometry,
  BufferAttribute,
  Color,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { PARTICLE_VERT, PARTICLE_FRAG } from './shaders/particles.js';

export const FORMATION_COUNT = 8;

/** Large enough to contain every formation plus idle drift and scroll smear. */
const FIELD_RADIUS = 48;

export class ParticleField {
  constructor({ count, pixelRatio, palette }) {
    this.count = count;

    const geometry = new BufferGeometry();

    const positions = new Float32Array(count * 3); // placeholder; real pos is computed in-shader
    const index = new Float32Array(count);
    const rand = new Float32Array(count);
    const seed = new Float32Array(count * 3);
    const scale = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      index[i] = i;
      rand[i] = Math.random();
      scale[i] = 0.5 + Math.random() * 0.9;
      seed[i * 3 + 0] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aIndex', new BufferAttribute(index, 1));
    geometry.setAttribute('aRand', new BufferAttribute(rand, 1));
    geometry.setAttribute('aSeed', new BufferAttribute(seed, 3));
    geometry.setAttribute('aScale', new BufferAttribute(scale, 1));

    // Real positions are computed in the vertex shader, so the `position`
    // attribute is all zeroes and an auto-computed bounding sphere would be a
    // degenerate point. Declare one big enough to contain every formation —
    // the renderer reads `boundingSphere.center` when depth-sorting
    // transparent objects, so a null here throws.
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), FIELD_RADIUS);
    geometry.computeBoundingSphere = () => {};

    this.material = new ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uTotal: { value: count },
        uSize: { value: 2.0 },
        uPixelRatio: { value: pixelRatio },
        uVelocity: { value: 0 },
        uOpacity: { value: 0 }, // faded in on first frames
        uColorA: { value: new Color(palette.accent) },
        uColorB: { value: new Color(palette.accent2) },
        uColorC: { value: new Color(palette.orange) },
      },
    });

    this.mesh = new Points(geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  setPixelRatio(value) {
    this.material.uniforms.uPixelRatio.value = value;
  }

  update({ elapsed, morph, velocity, opacity }) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uMorph.value = morph;
    // Clamp so a flung scroll cannot smear the field off-screen.
    u.uVelocity.value = Math.max(-40, Math.min(40, velocity));
    u.uOpacity.value = opacity;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
