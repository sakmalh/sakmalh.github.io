/**
 * Particle field shaders.
 *
 * Formations are computed procedurally in the vertex shader from a stable
 * per-particle seed rather than stored as one position buffer per formation.
 * At 150k particles that is the difference between ~2.4MB of attributes and
 * ~11MB, and it means morphing costs nothing on the CPU.
 */

export const PARTICLE_VERT = /* glsl */ `
  precision highp float;

  attribute float aIndex;
  attribute float aRand;
  attribute vec3  aSeed;
  attribute float aScale;

  uniform float uTime;
  uniform float uMorph;      // fractional formation index, 0 .. FORMATIONS-1
  uniform float uTotal;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uVelocity;   // scroll velocity, stretches the field slightly

  varying float vRand;
  varying float vDepth;

  const float PI  = 3.141592653589793;
  const float TAU = 6.283185307179586;

  // 0 — NEBULA: a hollow, flattened shell (hero).
  // The core is deliberately empty — that is where the hero copy sits, and a
  // filled centre blows out to white under additive blending.
  vec3 fNebula() {
    vec3 dir = normalize(aSeed * 2.0 - 1.0 + 0.0001);
    float r = 17.0 + pow(aRand, 0.7) * 15.0;
    return dir * r * vec3(1.1, 0.5, 1.1);
  }

  // 1 — STREAM: parallel lanes of moving data (the shell)
  vec3 fStream() {
    // A hollow tunnel of lanes running along the travel axis. Filled layouts
    // put 150k particles across the frame and read as static; keeping the
    // centre empty leaves the shell panel legible and turns the field into
    // something you move *through* rather than look at.
    float lanes = 10.0;
    float lane = floor(mod(aIndex, lanes));
    float along = fract(aIndex * 0.6180339887);
    float a = (lane / lanes) * TAU + aSeed.x * 0.22;
    float r = 27.0 + pow(aRand, 0.7) * 11.0;
    return vec3(cos(a) * r, sin(a) * r * 0.62, (along - 0.5) * 96.0);
  }

  // 2 — GLOBE: fibonacci sphere (about / "100K+ profiles")
  vec3 fGlobe() {
    float k = aIndex + 0.5;
    float phi = acos(1.0 - 2.0 * k / uTotal);
    float theta = PI * (1.0 + sqrt(5.0)) * k;
    vec3 p = vec3(cos(theta) * sin(phi), cos(phi), sin(theta) * sin(phi));
    return p * (11.0 + aRand * 0.7);
  }

  // 3 — PIPELINE: discrete stages with flow between them (architecture)
  vec3 fPipeline() {
    float stages = 5.0;
    float stage = floor(mod(aIndex, stages));
    float a = aSeed.x * TAU;
    float r = pow(aRand, 0.5) * 6.2;
    return vec3(
      (stage / (stages - 1.0) - 0.5) * 58.0 + (aSeed.z - 0.5) * 3.4,
      cos(a) * r,
      sin(a) * r
    );
  }

  // 4 — HELIX: a vertical timeline spine (experience)
  vec3 fHelix() {
    float t = aIndex / uTotal;
    float a = t * 5.0 * TAU + aRand * 0.35;
    float rad = 5.5 + sin(t * 9.0) * 0.9 + aRand * 1.4;
    return vec3(cos(a) * rad, (0.5 - t) * 46.0, sin(a) * rad);
  }

  // 5 — CLUSTERS: six discrete groups, one per project card
  vec3 fClusters() {
    float ci = mod(aIndex, 6.0);
    float ang = ci / 6.0 * TAU;
    vec3 c = vec3(cos(ang) * 14.0, (mod(ci, 2.0) - 0.5) * 9.0, sin(ang) * 14.0);
    vec3 jitter = normalize(aSeed * 2.0 - 1.0 + 0.0001) * pow(aRand, 0.5) * 3.4;
    return c + jitter;
  }

  // 6 — LATTICE: ordered grid (skills)
  vec3 fLattice() {
    float side = ceil(pow(uTotal, 1.0 / 3.0));
    float x = mod(aIndex, side);
    float y = mod(floor(aIndex / side), side);
    float z = floor(aIndex / (side * side));
    vec3 g = (vec3(x, y, z) / max(side - 1.0, 1.0) - 0.5) * 32.0;
    return g + (aSeed - 0.5) * 0.7;
  }

  // 7 — CONVERGENCE: everything collapses inward (contact)
  vec3 fConverge() {
    vec3 dir = normalize(aSeed * 2.0 - 1.0 + 0.0001);
    return dir * (1.6 + pow(aRand, 3.0) * 5.5);
  }

  vec3 formation(int id) {
    if (id <= 0) return fNebula();
    if (id == 1) return fStream();
    if (id == 2) return fGlobe();
    if (id == 3) return fPipeline();
    if (id == 4) return fHelix();
    if (id == 5) return fClusters();
    if (id == 6) return fLattice();
    return fConverge();
  }

  void main() {
    float m = clamp(uMorph, 0.0, 7.0);
    int a = int(floor(m));
    int b = int(min(floor(m) + 1.0, 7.0));
    float f = fract(m);
    f = f * f * (3.0 - 2.0 * f);           // smoothstep easing between formations

    vec3 pos = mix(formation(a), formation(b), f);

    // Idle drift so the field is never completely static.
    float t = uTime * 0.25;
    pos += vec3(
      sin(t + aRand * TAU) * 0.35,
      cos(t * 0.8 + aSeed.x * TAU) * 0.35,
      sin(t * 1.1 + aSeed.y * TAU) * 0.35
    );

    // Scroll velocity smears the field along Y — reads as motion blur.
    pos.y += uVelocity * 0.012 * (0.4 + aRand);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vDepth = -mvPosition.z;
    vRand = aRand;

    gl_PointSize = uSize * aScale * uPixelRatio * (30.0 / max(vDepth, 0.1));
  }
`;

export const PARTICLE_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uOpacity;

  varying float vRand;
  varying float vDepth;

  void main() {
    // Soft round sprite — cheaper and crisper than a texture lookup.
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d);

    vec3 col = mix(uColorA, uColorB, vRand);
    col = mix(col, uColorC, smoothstep(0.75, 1.0, vRand));

    // Fade with distance so the far side of a formation reads as depth.
    float fog = 1.0 - smoothstep(35.0, 95.0, vDepth);

    // Heavily attenuated: 150k additive sprites saturate to white very fast,
    // and body copy has to stay readable on top of this.
    gl_FragColor = vec4(col, alpha * uOpacity * fog * 0.42);
    if (gl_FragColor.a < 0.01) discard;
  }
`;
