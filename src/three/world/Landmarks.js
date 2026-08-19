import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Vector3,
  WireframeGeometry,
} from 'three';

function lineMaterial(color, opacity) {
  return new LineBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

function circleGeometry(radius, segments = 64) {
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(a) * radius;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  return g;
}

/**
 * Fixed structures that give each station a physical identity, plus the path
 * line that ties the whole world together. These stay put in world space —
 * unlike the particle field and graph, which travel with the viewer.
 */
export class Landmarks {
  constructor({ stations }) {
    this.group = new Group();
    this.animated = [];
    this.disposables = [];

    for (const station of stations) {
      const builder = this[`build_${station.landmark}`];
      if (builder) builder.call(this, station);
    }

    this.buildPath(stations);
  }

  #add(object, animation) {
    this.group.add(object);
    this.disposables.push(object);
    if (animation) this.animated.push({ object, ...animation });
  }

  // Hero — a slow wireframe core behind the name.
  build_core(station) {
    const wire = new WireframeGeometry(new IcosahedronGeometry(16, 1));
    const mesh = new LineSegments(wire, lineMaterial(station.accent, 0.09));
    mesh.position.copy(station.center).add(new Vector3(0, 0, -22));
    this.#add(mesh, { spin: new Vector3(0.01, 0.017, 0.006) });

    const inner = new LineSegments(
      new WireframeGeometry(new IcosahedronGeometry(7, 0)),
      lineMaterial('#d6e0da', 0.14)
    );
    inner.position.copy(mesh.position);
    this.#add(inner, { spin: new Vector3(-0.02, -0.03, 0) });
  }

  // Terminal — horizontal rules, like lines of output scrolling past.
  build_stream(station) {
    const points = [];
    for (let i = -6; i <= 6; i++) {
      const y = i * 3.2;
      const half = 30 - Math.abs(i) * 1.6;
      points.push(new Vector3(-half, y, 0), new Vector3(half, y, 0));
    }
    const rules = new LineSegments(
      new BufferGeometry().setFromPoints(points),
      lineMaterial(station.accent, 0.07)
    );
    rules.position.copy(station.center).add(new Vector3(0, 0, -20));
    this.#add(rules, { spin: new Vector3(0, 0.006, 0) });
  }

  // Architecture — five staged rings on a rail: the pipeline itself.
  build_pipeline(station) {
    const spread = 58;
    const rail = new Line(
      new BufferGeometry().setFromPoints([
        station.center.clone().add(new Vector3(-spread / 2, 0, -22)),
        station.center.clone().add(new Vector3(spread / 2, 0, -22)),
      ]),
      lineMaterial(station.accent, 0.28)
    );
    this.#add(rail);

    for (let i = 0; i < 5; i++) {
      const x = (i / 4 - 0.5) * spread;
      const ring = new LineLoop(circleGeometry(3.4, 32), lineMaterial(station.accent, 0.3));
      ring.position.copy(station.center).add(new Vector3(x, 0, -22));
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = i * 0.3;
      this.#add(ring, { spin: new Vector3(0, 0.05, 0), pulse: 0.6 + i * 0.12 });
    }
  }

  // About — orbital rings around the globe formation.
  build_orbit(station) {
    [13, 18, 24].forEach((radius, i) => {
      const ring = new LineLoop(circleGeometry(radius), lineMaterial(station.accent, 0.14 - i * 0.03));
      ring.position.copy(station.center).add(new Vector3(0, 0, -14));
      ring.rotation.x = Math.PI / 2.6 + i * 0.22;
      ring.rotation.z = i * 0.4;
      this.#add(ring, { spin: new Vector3(0, 0.05 - i * 0.012, 0) });
    });
  }

  // Experience — a literal spine, with a marker at each role.
  build_spine(station) {
    const panels = station.panels.filter((p) => p.spec.row !== undefined);
    if (!panels.length) return;

    const top = panels[0].world.clone().add(new Vector3(-panels[0].width / 2 - 2, panels[0].height / 2, 0));
    const bottom = panels[panels.length - 1].world
      .clone()
      .add(new Vector3(-panels[panels.length - 1].width / 2 - 2, -panels[panels.length - 1].height / 2, 0));

    const geo = new BufferGeometry().setFromPoints([top, bottom]);
    this.#add(new Line(geo, lineMaterial(station.accent, 0.4)));

    for (const panel of panels) {
      const marker = new LineLoop(circleGeometry(1.1, 24), lineMaterial(station.accent, 0.7));
      marker.position.copy(panel.world).add(new Vector3(-panel.width / 2 - 2, panel.height / 2 - 1.6, 0));
      marker.rotation.x = Math.PI / 2;
      this.#add(marker, { pulse: 0.9 });
    }
  }

  // Projects — a ring beneath each card, so they read as platforms in space.
  build_platforms(station) {
    for (const panel of station.panels) {
      if (panel.spec.row === undefined) continue;
      const ring = new LineLoop(circleGeometry(panel.width * 0.42, 40), lineMaterial(station.accent, 0.22));
      ring.position.copy(panel.world).add(new Vector3(0, -panel.height / 2 - 0.8, 0));
      this.#add(ring, { spin: new Vector3(0, 0.12, 0), pulse: 0.5 });
    }
  }

  // Skills — a wireframe lattice cage around the whole cluster.
  build_lattice(station) {
    const size = Math.max(station.extent?.width ?? 30, 30) * 0.72;
    const divisions = 6;
    const points = [];
    for (let i = 0; i <= divisions; i++) {
      const t = (i / divisions - 0.5) * 2 * size;
      points.push(new Vector3(-size, t, 0), new Vector3(size, t, 0));
      points.push(new Vector3(t, -size, 0), new Vector3(t, size, 0));
    }
    const geo = new BufferGeometry().setFromPoints(points);
    const grid = new LineSegments(geo, lineMaterial(station.accent, 0.07));
    grid.position.copy(station.center).add(new Vector3(0, 0, -20));
    this.#add(grid, { spin: new Vector3(0, 0, 0.004) });
  }

  // Contact — concentric rings breathing outward from the convergence point.
  build_beacon(station) {
    [6, 11, 17, 24].forEach((radius, i) => {
      const ring = new LineLoop(circleGeometry(radius, 48), lineMaterial(station.accent, 0.3 - i * 0.05));
      ring.position.copy(station.center).add(new Vector3(0, 0, -16));
      ring.rotation.x = Math.PI / 2;
      this.#add(ring, { breathe: { base: radius, phase: i * 0.7 } });
    });
  }

  /** The route itself, drawn faintly through every station. */
  buildPath(stations) {
    const curve = new CatmullRomCurve3(
      stations.map((s) => s.center.clone().add(new Vector3(0, -2, 6))),
      false,
      'catmullrom',
      0.4
    );
    const geo = new BufferGeometry().setFromPoints(curve.getPoints(400));
    this.#add(new Line(geo, lineMaterial('#ffb000', 0.14)));
  }

  update(elapsed) {
    for (const item of this.animated) {
      if (item.spin) {
        item.object.rotation.x += item.spin.x * 0.16;
        item.object.rotation.y += item.spin.y * 0.16;
        item.object.rotation.z += item.spin.z * 0.16;
      }
      if (item.pulse) {
        const s = 1 + Math.sin(elapsed * item.pulse) * 0.06;
        item.object.scale.setScalar(s);
      }
      if (item.breathe) {
        const { base, phase } = item.breathe;
        const s = 1 + Math.sin(elapsed * 0.6 + phase) * 0.12;
        item.object.scale.setScalar(s);
        item.object.material.opacity = 0.05 + Math.abs(Math.sin(elapsed * 0.6 + phase)) * 0.2;
      }
    }
  }

  dispose() {
    for (const object of this.disposables) {
      object.geometry?.dispose();
      object.material?.dispose();
    }
    this.group.clear();
  }
}
