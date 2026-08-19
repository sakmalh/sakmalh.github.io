import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  Object3D,
  Sphere,
  Vector3,
} from 'three';

/** Node shell radius plus drift and cursor push. */
const GRAPH_RADIUS = 26;

/**
 * The 3D descendant of the original 2D canvas node-graph: instanced node
 * spheres wired by nearest-neighbour edges, drifting and reacting to the
 * cursor. Node positions are public so SignalFlow can ride the same edges.
 */
export class AgentGraph {
  constructor({ nodeCount, edgeCount, palette }) {
    this.nodeCount = nodeCount;
    this.group = new Object3D();

    this.base = new Float32Array(nodeCount * 3);
    this.current = new Float32Array(nodeCount * 3);
    this.phase = new Float32Array(nodeCount);

    for (let i = 0; i < nodeCount; i++) {
      // Flattened shell — wide and shallow so it frames the HTML content.
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() * 2 - 1) * 0.85;
      const r = Math.sqrt(1 - y * y) * (13 + Math.random() * 7);
      this.base[i * 3 + 0] = Math.cos(theta) * r;
      this.base[i * 3 + 1] = y * 11;
      this.base[i * 3 + 2] = Math.sin(theta) * r;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.current.set(this.base);

    this.edges = this.#buildEdges(edgeCount);

    // ── nodes ──────────────────────────────────────────────────────────────
    const nodeGeo = new IcosahedronGeometry(0.16, 0);
    const nodeMat = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.nodes = new InstancedMesh(nodeGeo, nodeMat, nodeCount);
    this.nodes.frustumCulled = false;
    // InstancedMesh carries its own bounding sphere, defaulted to null.
    this.nodes.boundingSphere = new Sphere(new Vector3(0, 0, 0), GRAPH_RADIUS);

    const cA = new Color(palette.accent);
    const cB = new Color(palette.accent2);
    const tmp = new Color();
    for (let i = 0; i < nodeCount; i++) {
      tmp.copy(cA).lerp(cB, Math.random());
      this.nodes.setColorAt(i, tmp);
    }
    if (this.nodes.instanceColor) this.nodes.instanceColor.needsUpdate = true;

    // ── edges ──────────────────────────────────────────────────────────────
    const edgeGeo = new BufferGeometry();
    this.edgePositions = new Float32Array(this.edges.length * 6);
    this.edgeColors = new Float32Array(this.edges.length * 6);
    edgeGeo.setAttribute('position', new BufferAttribute(this.edgePositions, 3));
    edgeGeo.setAttribute('color', new BufferAttribute(this.edgeColors, 3));
    // Fixed sphere rather than a per-frame recompute: endpoints move every
    // frame, and the renderer needs a non-null sphere to depth-sort against.
    edgeGeo.boundingSphere = new Sphere(new Vector3(0, 0, 0), GRAPH_RADIUS);
    edgeGeo.computeBoundingSphere = () => {};

    const edgeColor = new Color(palette.accent2);
    for (let i = 0; i < this.edges.length * 2; i++) {
      this.edgeColors[i * 3 + 0] = edgeColor.r;
      this.edgeColors[i * 3 + 1] = edgeColor.g;
      this.edgeColors[i * 3 + 2] = edgeColor.b;
    }

    this.lines = new LineSegments(
      edgeGeo,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.22,
        blending: AdditiveBlending,
        depthWrite: false,
      })
    );
    this.lines.frustumCulled = false;

    this.group.add(this.nodes, this.lines);

    this.dummy = new Object3D();
  }

  /** Nearest-neighbour wiring, capped at the tier's edge budget. */
  #buildEdges(budget) {
    const { nodeCount, base } = this;
    const candidates = [];

    for (let i = 0; i < nodeCount; i++) {
      const neighbours = [];
      for (let j = 0; j < nodeCount; j++) {
        if (i === j) continue;
        const dx = base[i * 3] - base[j * 3];
        const dy = base[i * 3 + 1] - base[j * 3 + 1];
        const dz = base[i * 3 + 2] - base[j * 3 + 2];
        neighbours.push({ j, d: dx * dx + dy * dy + dz * dz });
      }
      neighbours.sort((a, b) => a.d - b.d);
      for (let k = 0; k < 3 && k < neighbours.length; k++) {
        const j = neighbours[k].j;
        candidates.push({ a: Math.min(i, j), b: Math.max(i, j), d: neighbours[k].d });
      }
    }

    const seen = new Set();
    const unique = [];
    for (const e of candidates.sort((x, y) => x.d - y.d)) {
      const key = `${e.a}-${e.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push([e.a, e.b]);
      if (unique.length >= budget) break;
    }
    return unique;
  }

  update({ elapsed, cursor, opacity, scale }) {
    const { base, current, phase, nodeCount } = this;

    for (let i = 0; i < nodeCount; i++) {
      const i3 = i * 3;
      const p = phase[i];

      let x = base[i3] + Math.sin(elapsed * 0.35 + p) * 0.5;
      let y = base[i3 + 1] + Math.cos(elapsed * 0.28 + p * 1.3) * 0.5;
      let z = base[i3 + 2] + Math.sin(elapsed * 0.31 + p * 0.7) * 0.5;

      // Cursor repulsion — the 3D echo of the original canvas interaction.
      if (cursor) {
        const dx = x - cursor.x;
        const dy = y - cursor.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 7 && dist > 0.001) {
          const push = (1 - dist / 7) * 2.4;
          x += (dx / dist) * push;
          y += (dy / dist) * push;
        }
      }

      current[i3] = x;
      current[i3 + 1] = y;
      current[i3 + 2] = z;

      this.dummy.position.set(x, y, z);
      const s = 0.7 + Math.sin(elapsed * 1.6 + p) * 0.3;
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.nodes.setMatrixAt(i, this.dummy.matrix);
    }
    this.nodes.instanceMatrix.needsUpdate = true;

    // Edge endpoints follow the nodes. At a few hundred edges this is cheap.
    for (let e = 0; e < this.edges.length; e++) {
      const [a, b] = this.edges[e];
      const o = e * 6;
      this.edgePositions[o + 0] = current[a * 3];
      this.edgePositions[o + 1] = current[a * 3 + 1];
      this.edgePositions[o + 2] = current[a * 3 + 2];
      this.edgePositions[o + 3] = current[b * 3];
      this.edgePositions[o + 4] = current[b * 3 + 1];
      this.edgePositions[o + 5] = current[b * 3 + 2];
    }
    this.lines.geometry.attributes.position.needsUpdate = true;

    this.nodes.material.opacity = 0.9 * opacity;
    this.lines.material.opacity = 0.22 * opacity;
    this.group.scale.setScalar(scale);
    this.group.rotation.y = elapsed * 0.04;
  }

  dispose() {
    this.nodes.geometry.dispose();
    this.nodes.material.dispose();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
