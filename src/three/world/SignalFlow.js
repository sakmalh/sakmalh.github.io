import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';

const VERT = /* glsl */ `
  precision mediump float;
  attribute float aFade;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vFade;
  void main() {
    vFade = aFade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (30.0 / max(-mv.z, 0.1));
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * vFade * uOpacity);
  }
`;

/**
 * Tokens travelling along the agent graph's edges. Positions are computed on
 * the CPU — at ~120 pulses that is free, and it keeps the pulses locked to
 * edges whose endpoints move every frame.
 */
export class SignalFlow {
  constructor({ count, graph, palette }) {
    this.count = count;
    this.graph = graph;

    this.edgeOf = new Int32Array(count);
    this.t = new Float32Array(count);
    this.speed = new Float32Array(count);

    const edgeTotal = graph.edges.length || 1;
    for (let i = 0; i < count; i++) {
      this.edgeOf[i] = Math.floor(Math.random() * edgeTotal);
      this.t[i] = Math.random();
      this.speed[i] = 0.25 + Math.random() * 0.55;
    }

    this.positions = new Float32Array(count * 3);
    this.fade = new Float32Array(count);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aFade', new BufferAttribute(this.fade, 1));
    // Pulses ride the graph's edges, so they share its extent. Non-null is
    // required for transparent depth sorting.
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 26);
    geometry.computeBoundingSphere = () => {};

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uSize: { value: 5.0 },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 0 },
        uColor: { value: new Color(palette.accent2) },
      },
    });

    this.mesh = new Points(geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  setPixelRatio(value) {
    this.material.uniforms.uPixelRatio.value = value;
  }

  update({ delta, velocity, opacity }) {
    const { graph, positions, fade, t, speed, edgeOf, count } = this;
    const nodes = graph.current;
    const edges = graph.edges;
    if (!edges.length) return;

    // Scrolling accelerates the flow — the system "reacts" to the visitor.
    const boost = 1 + Math.min(Math.abs(velocity) * 0.04, 3);

    for (let i = 0; i < count; i++) {
      t[i] += delta * speed[i] * boost;
      if (t[i] > 1) {
        t[i] -= 1;
        edgeOf[i] = Math.floor(Math.random() * edges.length); // hop to a new edge
      }

      const [a, b] = edges[edgeOf[i]];
      const p = t[i];
      const i3 = i * 3;
      positions[i3 + 0] = nodes[a * 3] + (nodes[b * 3] - nodes[a * 3]) * p;
      positions[i3 + 1] = nodes[a * 3 + 1] + (nodes[b * 3 + 1] - nodes[a * 3 + 1]) * p;
      positions[i3 + 2] = nodes[a * 3 + 2] + (nodes[b * 3 + 2] - nodes[a * 3 + 2]) * p;

      // Fade in and out at the endpoints so pulses don't pop.
      fade[i] = Math.sin(p * Math.PI);
    }

    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aFade.needsUpdate = true;
    this.material.uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
