// The 3D "desk" scene behind the scroll story.
//
// The page content lives in index.html as ordinary sections (.chap). This
// module only draws the room and moves the camera: each section id has a
// camera stop in STOPS, and scrolling blends between neighbouring stops.
// Props tied to a chapter (thought graph, rack LEDs, shelf labels) fade in
// by that chapter's id, so reordering sections in the HTML needs no change here.

import * as THREE from 'three';

export function startStory({ canvas, labelsEl, chapters, reduced }) {
  const small = innerWidth <= 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.setClearColor(0x0e1116, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e1116, 5, 11);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);

  // ── helpers ──────────────────────────────────────────────────────────────
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, ...o });
  function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.rotation.set(...rot);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m); return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, a = 24, b = 16) => new THREE.SphereGeometry(r, a, b);
  const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const GLOW = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const glow = (color, s, o = 0.6) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(s); return sp;
  };

  // ── room ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x151a21, 0.8));
  const key = new THREE.DirectionalLight(0xffe6cc, 2.1);
  key.position.set(2.2, 3.4, 2.8); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -1 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7dd3fc, 1.1); rim.position.set(-2.5, 2.2, -2); scene.add(rim);
  const screenLight = new THREE.PointLight(0x9fc6ff, 0.6, 1.6, 1.5); screenLight.position.set(0, 1.0, 0.38); scene.add(screenLight);

  mesh(new THREE.CircleGeometry(5, 64), std(0x141922), scene, [0, 0, 0], [-Math.PI / 2, 0, 0], false);
  mesh(new THREE.PlaneGeometry(10, 5), std(0x11161e), scene, [0, 2.5, -1.25], [0, 0, 0], false);

  const wood = std(0x2e3542, { roughness: 0.6 });
  const metal = std(0x1c222c, { roughness: 0.4, metalness: 0.4 });
  mesh(box(1.5, 0.04, 0.7), wood, scene, [0, 0.74, 0.42]);
  for (const [x, z] of [[-0.7, 0.12], [0.7, 0.12], [-0.7, 0.72], [0.7, 0.72]]) mesh(box(0.04, 0.72, 0.04), metal, scene, [x, 0.36, z]);

  const chairM = std(0x1f2530);
  mesh(box(0.46, 0.06, 0.42), chairM, scene, [0, 0.47, -0.2]);
  mesh(box(0.46, 0.52, 0.05), chairM, scene, [0, 0.8, -0.44], [-0.08, 0, 0]);
  mesh(cyl(0.03, 0.03, 0.4), metal, scene, [0, 0.24, -0.2]);
  mesh(cyl(0.25, 0.25, 0.03, 5), metal, scene, [0, 0.03, -0.2]);

  // laptop; its screen is a canvas redrawn per chapter
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 512; screenCanvas.height = 336;
  const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
  const laptop = new THREE.Group(); laptop.position.set(0, 0.76, 0.34); scene.add(laptop);
  const alu = std(0x3a4150, { metalness: 0.5, roughness: 0.35 });
  mesh(box(0.34, 0.018, 0.23), alu, laptop, [0, 0.009, 0]);
  mesh(box(0.3, 0.002, 0.12), std(0x20252e), laptop, [0, 0.019, -0.02]);
  const lid = new THREE.Group(); lid.position.set(0, 0.018, 0.115); lid.rotation.x = 0.28; laptop.add(lid);
  mesh(box(0.34, 0.23, 0.012), alu, lid, [0, 0.115, 0.006]);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.115, -0.001); screen.rotation.y = Math.PI; lid.add(screen);

  // desk props
  const ceramic = std(0xe6e9ef, { roughness: 0.4 });
  mesh(cyl(0.04, 0.035, 0.09), ceramic, scene, [0.48, 0.805, 0.36]);
  mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), ceramic, scene, [0.525, 0.81, 0.36]);
  mesh(cyl(0.06, 0.05, 0.1), std(0x3a2f2a), scene, [-0.55, 0.81, 0.5]);
  for (const [x, y, z, r] of [[0, 0.12, 0, 0.07], [0.03, 0.17, 0.02, 0.05], [-0.03, 0.16, -0.02, 0.05]]) mesh(sph(r, 12, 8), std(0x3f7a57), scene, [-0.55 + x, 0.76 + y, 0.5 + z]);

  // server rack: one slab per microservice (six of them)
  const rack = new THREE.Group(); rack.position.set(1.2, 0, -0.45); scene.add(rack);
  mesh(box(0.46, 1.3, 0.5), std(0x171c24, { roughness: 0.5 }), rack, [0, 0.65, 0]);
  const leds = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.18 + i * 0.19;
    mesh(box(0.4, 0.14, 0.02), std(0x222936, { metalness: 0.3 }), rack, [0, y, 0.255]);
    for (let k = 0; k < 3; k++) {
      const m = new THREE.MeshBasicMaterial({ color: k === 0 ? 0x86efac : 0xfdba74, toneMapped: false });
      mesh(box(0.025, 0.018, 0.01), m, rack, [0.12 + k * 0.04, y, 0.27], [0, 0, 0], false);
      leds.push({ m, seed: Math.random() * 10, k });
    }
  }

  // diplomas
  const diplomaTex = (lines) => canvasTex(512, 380, (g) => {
    g.fillStyle = '#f1ede4'; g.fillRect(0, 0, 512, 380);
    g.strokeStyle = '#b9a8e8'; g.lineWidth = 6; g.strokeRect(18, 18, 476, 344);
    g.fillStyle = '#2b2540'; g.textAlign = 'center';
    for (const [t, size, y, wgt] of lines) { g.font = `${wgt || 500} ${size}px Georgia, serif`; g.fillText(t, 256, y); }
  });
  function diploma(x, y, w, h, tex) {
    const g = new THREE.Group(); g.position.set(x, y, -1.23); scene.add(g);
    mesh(box(w + 0.04, h + 0.04, 0.025), std(0x2b2540, { roughness: 0.4 }), g);
    mesh(new THREE.PlaneGeometry(w, h), std(0xffffff, { map: tex, roughness: 0.9 }), g, [0, 0, 0.014], [0, 0, 0], false);
    return g;
  }
  const bsc = diploma(-0.78, 1.58, 0.52, 0.38, diplomaTex([['Staffordshire University', 30, 90, 600], ['Bachelor of Science', 26, 150], ['Computer Science', 34, 200, 600], ['First Class Honours', 30, 270, 700], ['2024', 22, 330]]));
  diploma(-0.3, 1.45, 0.3, 0.22, diplomaTex([['Pearson BTEC', 34, 110, 600], ['HND Computer Science', 34, 190, 600], ['Merit', 34, 270, 700]]));

  // whiteboard for the internship
  {
    const tex = canvasTex(640, 384, (g) => {
      g.fillStyle = '#eef1f5'; g.fillRect(0, 0, 640, 384);
      g.fillStyle = '#1f2937'; g.font = '600 30px "Geist Mono", monospace'; g.fillText('QA sprint · intern', 36, 58);
      g.strokeStyle = '#94a3b8'; g.lineWidth = 2; g.beginPath(); g.moveTo(36, 76); g.lineTo(604, 76); g.stroke();
      [['✓', '40+ Selenium UI tests', '#15803d'], ['✓', 'JMeter + Datadog load tests', '#15803d'], ['!', '3 bottlenecks caught pre-prod', '#c2410c'], ['✓', 'RBAC: candidates / recruiters', '#15803d'], ['✓', 'security review: no issues', '#15803d']]
        .forEach(([m, t, col], i) => {
          g.fillStyle = col; g.font = '700 28px "Geist Mono", monospace'; g.fillText(m, 40, 128 + i * 52);
          g.fillStyle = '#1f2937'; g.font = '500 25px "Geist Mono", monospace'; g.fillText(t, 84, 128 + i * 52);
        });
    });
    const wb = new THREE.Group(); wb.position.set(-0.02, 1.96, -1.23); scene.add(wb);
    const frame = std(0x9ca5b4, { metalness: 0.4, roughness: 0.4 });
    mesh(box(0.74, 0.46, 0.02), frame, wb);
    mesh(new THREE.PlaneGeometry(0.7, 0.42), std(0xffffff, { map: tex, roughness: 0.6 }), wb, [0, 0, 0.011], [0, 0, 0], false);
    mesh(box(0.5, 0.015, 0.04), frame, wb, [0, -0.24, 0.02]);
  }

  // shelf: one object per side project, split across two chapters
  const shelf = new THREE.Group(); shelf.position.set(0.78, 1.34, -1.12); scene.add(shelf);
  mesh(box(1.34, 0.03, 0.22), wood, shelf);
  const shelfItems = [];
  const item = (x, name, sub, c, chap, build) => {
    const g = new THREE.Group(); g.position.set(x, 0.015, 0); shelf.add(g);
    const top = build(g);
    shelfItems.push({ obj: g, off: [0, top, 0], name, sub, c, chap });
  };
  item(-0.55, 'AgentTrace', 'agent observability', '#c4b5fd', 'projects', (g) => {
    mesh(box(0.02, 0.05, 0.02), metal, g, [0, 0.025, 0]);
    mesh(box(0.17, 0.11, 0.015), std(0x1a1f28), g, [0, 0.1, 0]);
    const t = canvasTex(128, 80, (cx) => {
      cx.fillStyle = '#10131a'; cx.fillRect(0, 0, 128, 80); cx.strokeStyle = '#c4b5fd'; cx.lineWidth = 3; cx.beginPath();
      [10, 50, 30, 60, 22, 45, 15, 55, 35].forEach((v, i) => (i ? cx.lineTo(i * 15 + 4, v) : cx.moveTo(4, v))); cx.stroke();
    });
    mesh(new THREE.PlaneGeometry(0.155, 0.095), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), g, [0, 0.1, 0.008], [0, 0, 0], false);
    return 0.19;
  });
  item(-0.33, 'DevTools MCP', 'Claude ↔ GitHub, CI', '#93c5fd', 'projects', (g) => {
    for (let i = 0; i < 3; i++) {
      mesh(box(0.12, 0.035, 0.1), std(0x93c5fd, { roughness: 0.45 }), g, [0, 0.02 + i * 0.04, 0]);
      mesh(box(0.012, 0.008, 0.005), new THREE.MeshBasicMaterial({ color: 0x86efac }), g, [0.04, 0.02 + i * 0.04, 0.052], [0, 0, 0], false);
    }
    return 0.19;
  });
  item(-0.11, 'AI Resume Search', '10,000+ résumés', '#c4b5fd', 'projects', (g) => {
    for (let i = 0; i < 3; i++) mesh(box(0.1, 0.006, 0.13), std(0xe9e5dc), g, [0, 0.004 + i * 0.007, 0], [0, i * 0.12 - 0.1, 0]);
    mesh(new THREE.TorusGeometry(0.035, 0.008, 10, 28), std(0xc4b5fd, { roughness: 0.35, metalness: 0.3 }), g, [0.01, 0.08, 0]);
    mesh(cyl(0.007, 0.007, 0.07), std(0x2b2540), g, [0.045, 0.035, 0], [0, 0, 0.6]);
    return 0.2;
  });
  const spinners = [];
  item(0.12, 'Agentic-Map', 'multi-agent trip planner', '#86efac', 'projects2', (g) => {
    mesh(cyl(0.03, 0.04, 0.02), metal, g, [0, 0.01, 0]);
    const globe = mesh(sph(0.065, 24, 16), std(0x86efac, { roughness: 0.5 }), g, [0, 0.1, 0]);
    const wire = new THREE.Mesh(sph(0.068, 12, 8), new THREE.MeshBasicMaterial({ color: 0x0e1116, wireframe: true, transparent: true, opacity: 0.5 }));
    wire.position.copy(globe.position); g.add(wire); spinners.push(globe, wire);
    return 0.22;
  });
  item(0.34, 'HouseDiffusion', 'floor plans in < 5 s', '#fdba74', 'projects2', (g) => {
    mesh(box(0.1, 0.08, 0.09), std(0xfdba74, { roughness: 0.6 }), g, [0, 0.04, 0]);
    mesh(new THREE.ConeGeometry(0.085, 0.07, 4), std(0xb45f2a), g, [0, 0.115, 0], [0, Math.PI / 4, 0]);
    return 0.2;
  });
  item(0.55, 'Assignment Reminder', '30+ students', '#86efac', 'projects2', (g) => {
    mesh(box(0.055, 0.105, 0.01), std(0x1a1f28, { roughness: 0.3 }), g, [0, 0.055, 0], [-0.15, 0, 0]);
    mesh(box(0.045, 0.018, 0.002), new THREE.MeshBasicMaterial({ color: 0x86efac }), g, [0, 0.08, 0.0065], [-0.15, 0, 0], false);
    mesh(box(0.035, 0.012, 0.002), new THREE.MeshBasicMaterial({ color: 0xfdba74 }), g, [0, 0.055, 0.01], [-0.15, 0, 0], false);
    return 0.19;
  });

  // ── the avatar: a generic, friendly developer figure ─────────────────────
  // Deliberately not a likeness; the real photo is on the About card.
  const skin = std(0xc08a64, { roughness: 0.6 });
  const hoodie = std(0x34445e, { roughness: 0.85 });
  const cuffM = std(0x2b3950, { roughness: 0.85 });
  const trousers = std(0x1d212a);
  const hairM = std(0x2a1c15, { roughness: 0.95 });

  const avatar = new THREE.Group(); scene.add(avatar);
  const torso = new THREE.Group(); torso.position.set(0, 0.56, -0.2); torso.rotation.x = 0.12; avatar.add(torso);
  const chest = mesh(cap(0.17, 0.3), hoodie, torso, [0, 0.28, 0]); chest.scale.set(1.15, 1, 0.78);
  mesh(new THREE.TorusGeometry(0.11, 0.045, 10, 28), hoodie, torso, [0, 0.5, -0.01], [Math.PI / 2, 0, 0]); // hood
  for (const x of [-0.035, 0.035]) mesh(box(0.012, 0.09, 0.005), std(0xe6e9ef), torso, [x, 0.44, 0.135], [0.05, 0, 0]); // drawstrings
  mesh(box(0.16, 0.08, 0.01), cuffM, torso, [0, 0.14, 0.132], [0.1, 0, 0]);         // front pocket

  const headG = new THREE.Group(); headG.position.set(0, 0.6, 0.02); torso.add(headG);
  mesh(cyl(0.05, 0.055, 0.12), skin, headG, [0, -0.02, 0]);
  // Head: hair shading is painted into the vertex colours so the hairline
  // fades into the skin instead of ending in a hard edge, then short tufts
  // are scattered over the hair region for texture and volume.
  // Regions are defined on the unit direction d from the head centre
  // (+z is the face, +y the crown).
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hairAt = (d) => {
    // hairline: high at the forehead, lower over the ears, lowest at the nape
    const thr = d.z > 0 ? 0.14 + 0.34 * d.z : 0.14 + 0.52 * d.z;
    let h = smoothstep(thr - 0.05, thr + 0.05, d.y);
    // short sideburns in front of the ears
    if (Math.abs(d.x) > 0.8 && d.z > -0.05 && d.z < 0.45 && d.y > -0.12) h = Math.max(h, 0.95);
    return h;
  };

  const headGeo = sph(0.14, 72, 54);
  {
    const pos = headGeo.attributes.position, col = new Float32Array(pos.count * 3);
    const cSkin = new THREE.Color(0xc08a64), cHair = new THREE.Color(0x2a1c15), c = new THREE.Color(), d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      c.copy(cSkin).lerp(cHair, hairAt(d));
      c.toArray(col, i * 3);
    }
    headGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const head = mesh(headGeo, std(0xffffff, { vertexColors: true, roughness: 0.62 }), headG, [0, 0.14, 0]);
  head.scale.set(0.93, 1.06, 0.97);

  function tufts({ n, keep, lift, size, flat, color, seed }) {
    const rnd = (() => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const golden = Math.PI * (3 - Math.sqrt(5)), mats = [];
    const d = new THREE.Vector3(), q = new THREE.Quaternion(), spin = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = golden * i;
      d.set(Math.cos(th) * r, y, Math.sin(th) * r);
      if (keep(d) < 0.35 + rnd() * 0.4) continue;                        // ragged, natural edge
      const s = size(d) * (0.75 + rnd() * 0.5);
      q.setFromUnitVectors(up, d).multiply(spin.setFromAxisAngle(up, rnd() * 6.28));
      mats.push(new THREE.Matrix4().compose(
        d.clone().multiplyScalar(0.14 * lift(d, rnd())), q.clone(), new THREE.Vector3(s, s * flat, s)));
    }
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std(color, { roughness: 1, flatShading: true }), mats.length);
    const tint = new THREE.Color();
    mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, tint.setHex(color).multiplyScalar(0.8 + rnd() * 0.45)); });
    im.castShadow = true;
    head.add(im);
  }
  // hair: short on the sides, fuller on top, a little lift at the front
  tufts({
    n: 1800, keep: hairAt, flat: 0.5, color: 0x2e1f17, seed: 7,
    size: (d) => 0.011 + 0.01 * smoothstep(0.2, 0.8, d.y),
    lift: (d, r) => 0.995 + 0.085 * smoothstep(0.35, 1, d.y) + 0.035 * Math.max(d.z, 0) * Math.max(d.y, 0) + r * 0.008,
  });
  mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 20, Math.PI), std(0x8a4f3c), headG, [0, 0.078, 0.14], [0, 0, Math.PI], false);
  mesh(sph(0.03, 12, 10), skin, headG, [-0.13, 0.13, 0]);
  mesh(sph(0.03, 12, 10), skin, headG, [0.13, 0.13, 0]);
  mesh(sph(0.021, 12, 10), skin, headG, [0, 0.12, 0.142]);
  const eyeM = std(0x14161b, { roughness: 0.3 });
  const eyes = [-0.048, 0.048].map((x) => { const e = mesh(sph(0.018, 16, 12), eyeM, headG, [x, 0.158, 0.122], [0, 0, 0], false); e.scale.z = 0.55; return e; });
  [-0.05, 0.05].forEach((x, i) => mesh(box(0.05, 0.012, 0.012), hairM, headG, [x, 0.195, 0.128], [0, 0, i ? -0.06 : 0.06], false));

  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.44, 0); torso.add(sh);
    mesh(cap(0.056, 0.2), hoodie, sh, [0, -0.14, 0]);
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    mesh(cap(0.05, 0.18), hoodie, el, [0, -0.12, 0]);
    mesh(cyl(0.05, 0.05, 0.03), cuffM, el, [0, -0.225, 0]);                            // cuff
    mesh(sph(0.048, 16, 12), skin, el, [0, -0.27, 0]);
    return { sh, el, side };
  }
  const arms = [arm(-1), arm(1)];
  for (const s of [-1, 1]) {
    mesh(cap(0.075, 0.3), trousers, avatar, [s * 0.1, 0.5, 0], [Math.PI / 2, 0, 0]);
    mesh(cap(0.065, 0.3), trousers, avatar, [s * 0.1, 0.29, 0.2]);
    mesh(box(0.1, 0.06, 0.2), std(0xe6e9ef, { roughness: 0.5 }), avatar, [s * 0.1, 0.03, 0.25]);
  }

  // ── thought graph above the head: the interview agent's loop ─────────────
  const thought = new THREE.Group(); thought.position.set(0, 1.66, -0.1); scene.add(thought);
  const TN = [
    ['competency block', [-0.3, 0.06, 0], 0x93c5fd], ['ask', [-0.12, 0.2, 0.03], 0xc4b5fd], ['fairness critic', [0.12, 0.16, -0.02], 0xfdba74],
    ['score', [0.26, -0.01, 0.02], 0xc4b5fd], ['assessment store', [0.02, -0.1, 0], 0x86efac],
  ].map(([name, p, c]) => {
    const v = new THREE.Vector3(...p);
    const core = new THREE.Mesh(sph(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, toneMapped: false }));
    core.position.copy(v); thought.add(core);
    const g = glow(c, 0.22, 0.6); g.position.copy(v); thought.add(g);
    return { name, v, c, core, g };
  });
  const tCurve = new THREE.CatmullRomCurve3(TN.map((n) => n.v), true);
  const tLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tCurve.getPoints(80)), new THREE.LineBasicMaterial({ color: 0x8b93c9, transparent: true }));
  thought.add(tLine);
  const packet = glow(0xffffff, 0.12, 1); thought.add(packet);

  // ── labels projected from 3D onto the page ───────────────────────────────
  const mkLabel = (html, c) => {
    const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = html;
    el.style.setProperty('--c', c); labelsEl.appendChild(el); return el;
  };
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const hotspots = [
    ...shelfItems.map((s) => ({ el: mkLabel(`${s.name}<small>${s.sub}</small>`, s.c), obj: s.obj, off: new THREE.Vector3(...s.off), chap: s.chap })),
    ...[0, 2, 4].map((i) => ({ el: mkLabel(TN[i].name, hex(TN[i].c)), obj: thought, off: TN[i].v.clone().add(new THREE.Vector3(0, 0.05, 0)), chap: 'ai' })),
    { el: mkLabel('6 services<small>one shared library set</small>', '#fdba74'), obj: rack, off: new THREE.Vector3(0, 1.4, 0.25), chap: 'junior' },
    { el: mkLabel('First Class Honours', '#c4b5fd'), obj: bsc, off: new THREE.Vector3(0, 0.26, 0), chap: 'education' },
  ];

  // ── laptop screen per chapter ────────────────────────────────────────────
  const SCREENS = {
    intro: ['akmal.sh', ['$ whoami', 'full-stack engineer, backend + AI', '$ uptime', 'shipping since 2022']],
    about: ['about', ['2022-09  intern', '2023-03  junior software engineer', '2024-09  software engineer', 'status   open to roles']],
    ai: ['interview_agent.py', ['graph.add_node("competency_block")', 'graph.add_node("ask")', 'graph.add_node("fairness_critic")', 'graph.add_edge("fairness_critic", "ask")']],
    search: ['search', ['$ search "backend, FastAPI, 3+ yrs"', 'route    filters | semantic', 'vector   atlas, max-pooled', 'rerank   voyage', '100,000+ profiles, under 1 s']],
    team: ['portal.tsx', ['const [state, dispatch] =', '  useReducer(reducer, init)', '<PortalContext.Provider', '  value={{ state, dispatch }}>']],
    junior: ['grafana', ['services  6 / 6 on shared libs', 'ec2       right-sized', 'autoscale tightened', 'uptime    unchanged']],
    intern: ['tests', ['$ selenium suite', '40+ UI flows covered', '$ jmeter load', '3 bottlenecks flagged']],
    education: ['transcript', ['B.Sc. Computer Science', 'First Class Honours · 2024', 'HND Computer Science', 'Merit · 2022']],
    projects: ['~/projects', ['agenttrace/', 'devtools-mcp/', 'ai-resume-search/']],
    projects2: ['~/projects', ['agentic-map/', 'house-diffusion/', 'assignment-reminder/']],
    skills: ['toolbox', ['python  fastapi  mongodb', 'langgraph  rag  mcp', 'react  typescript', 'kubernetes  aws']],
    contact: ['mail', ['to: you', "subject: let's talk", '', 's.hameedakmal@gmail.com']],
  };
  let screenId = null;
  function drawScreen(id) {
    if (id === screenId || !SCREENS[id]) return;
    screenId = id;
    const g = screenCanvas.getContext('2d'), [title, lines] = SCREENS[id];
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, 512, 336);
    g.fillStyle = '#161b22'; g.fillRect(0, 0, 512, 36);
    ['#f87171', '#fbbf24', '#86efac'].forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.arc(20 + k * 18, 18, 5, 0, 7); g.fill(); });
    g.fillStyle = '#9ca5b4'; g.font = '500 16px "Geist Mono", monospace'; g.fillText(title, 90, 24);
    g.font = '500 19px "Geist Mono", monospace';
    lines.forEach((l, k) => { g.fillStyle = l.startsWith('$') ? '#86efac' : '#cdd3dd'; g.fillText(l, 22, 80 + k * 44); });
    screenTex.needsUpdate = true;
  }

  // ── camera stops, keyed by section id ────────────────────────────────────
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const STOPS = {
    intro:     { p: V(2.3, 1.75, 3.1),   t: V(0.2, 0.95, 0),      pan: 0.3 },  // whole room
    about:     { p: V(0.12, 1.32, 1.1),  t: V(0, 1.2, -0.1),      pan: 0.26 }, // face
    ai:        { p: V(-0.85, 1.9, 1.15), t: V(0.05, 1.58, -0.1),  pan: 0.3 },  // head + thoughts
    search:    { p: V(-0.38, 1.3, -0.62),t: V(0, 0.86, 0.45),     pan: 0.3 },  // over the shoulder
    team:      { p: V(-1.55, 1.15, 0.75),t: V(0, 0.92, 0.1),      pan: 0.3 },  // side view, typing
    junior:    { p: V(2.5, 1.4, 1.7),    t: V(1.1, 0.78, -0.4),   pan: 0.3 },  // rack
    intern:    { p: V(0.3, 1.92, 0.55),  t: V(-0.02, 1.92, -1.23),pan: 0.28 }, // whiteboard
    education: { p: V(-1.0, 1.62, 0.15), t: V(-0.6, 1.52, -1.2),  pan: 0.26 }, // diplomas
    projects:  { p: V(0.45, 1.6, 0.2),   t: V(0.45, 1.44, -1.12), pan: 0.22 }, // shelf, left
    projects2: { p: V(1.22, 1.6, 0.2),   t: V(1.22, 1.44, -1.12), pan: 0.22 }, // shelf, right
    skills:    { p: V(1.1, 2.5, 1.8),    t: V(0, 0.8, 0.2),       pan: 0.3 },  // over the desk
    contact:   { p: V(-0.3, 1.45, 3.4),  t: V(0, 0.95, 0),        pan: 0.3 },  // pull back, wave
  };
  const ids = chapters.map((c) => c.id);
  const stops = ids.map((id) => STOPS[id] || STOPS.intro);
  const at = (id) => ids.indexOf(id);

  function progress() {
    const mid = scrollY + innerHeight / 2;
    const centers = chapters.map((s) => s.offsetTop + s.offsetHeight / 2);
    if (mid <= centers[0]) return 0;
    for (let i = 0; i < centers.length - 1; i++) if (mid < centers[i + 1]) return i + (mid - centers[i]) / (centers[i + 1] - centers[i]);
    return centers.length - 1;
  }
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  const wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), off = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  function desired(s) {
    const i = Math.min(stops.length - 2, Math.floor(s)), e = smooth(0.18, 0.82, s - i);
    const A = stops[i], B = stops[i + 1];
    wantPos.lerpVectors(A.p, B.p, e);
    wantTgt.lerpVectors(A.t, B.t, e);
    // Pan so the subject sits beside its text card instead of under it.
    const aspect = innerWidth / innerHeight;
    fwd.subVectors(wantTgt, wantPos); const dist = fwd.length(); fwd.normalize();
    right.crossVectors(fwd, Y).normalize(); up.crossVectors(right, fwd).normalize();
    if (innerWidth <= 760) {
      // Phones: cards sit at the bottom, so pull back and lift the subject.
      const back = dist * (1 / Math.max(0.45, aspect) - 1) * 0.55;
      wantPos.addScaledVector(fwd, -back);
      off.copy(up).multiplyScalar(-(dist + back) * 0.2);
    } else {
      const side = lerp(chapters[i].dataset.side === 'left' ? 1 : -1, chapters[i + 1].dataset.side === 'left' ? 1 : -1, e);
      off.copy(right).multiplyScalar(-side * lerp(A.pan, B.pan, e) * dist * Math.min(1.2, aspect / 1.5));
    }
    wantPos.add(off); wantTgt.add(off);
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  const ptr = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = -(e.clientY / innerHeight) * 2 + 1; }, { passive: true });
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), _p = new THREE.Vector3();
  desired(progress()); camPos.copy(wantPos); camTgt.copy(wantTgt);
  let t = 0, last = performance.now(), blinkAt = 2;
  const motion = reduced ? 0 : 1;

  function frame(now) {
    requestAnimationFrame(frame);
    // Timestamps from rAF can precede the performance.now() taken at start.
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (document.hidden) return;
    t += dt * motion;
    const s = progress();
    const w = (id) => { const k = at(id); return k < 0 ? 0 : Math.max(0, 1 - Math.abs(s - k) * 1.6); };
    drawScreen(ids[Math.round(s)]);

    desired(s);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    camPos.lerp(wantPos, k); camTgt.lerp(wantTgt, k);
    camera.position.copy(camPos);
    camera.position.x += ptr.x * 0.04 * motion; camera.position.y += ptr.y * 0.03 * motion;
    camera.lookAt(camTgt);

    // breathing, looking toward the cursor (or at the camera on "about"), blinking
    torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008;
    const face = w('about');
    headG.rotation.y = lerp(ptr.x * 0.35 * motion, 0, face) + Math.sin(t * 0.4) * 0.04;
    headG.rotation.x = lerp(-ptr.y * 0.15 * motion + 0.08, -0.05, face) - w('ai') * 0.12;
    if (motion && t > blinkAt) {
      const b = t - blinkAt; const sc = b < 0.12 ? 0.1 : 1;
      for (const e of eyes) e.scale.y = sc;
      if (b > 0.14) blinkAt = t + 2.5 + Math.random() * 3;
    }

    // typing at the laptop, waving on "contact"
    const wave = w('contact'), typing = (w('search') + w('team')) * 0.8 + 0.2;
    arms.forEach(({ sh, el, side }, i) => {
      const tap = Math.sin(t * 16 + i * 1.7) * 0.06 * typing * motion;
      let sx = -0.82, sz = side * 0.16, ex = -0.95 + tap, ez = 0;
      if (side === 1) {
        sx = lerp(sx, -0.15, wave); sz = lerp(sz, 2.5, wave);
        ex = lerp(ex, 0, wave); ez = lerp(0, 0.35 + Math.sin(t * 7) * 0.4 * motion, wave);
      }
      sh.rotation.set(sx, 0, sz); el.rotation.set(ex, 0, ez);
    });
    torso.rotation.y = wave * -0.12;

    const tw = w('ai');
    thought.visible = tw > 0.01;
    TN.forEach((n, i) => { n.core.material.opacity = tw; n.g.material.opacity = tw * (0.45 + 0.25 * Math.sin(t * 2 + i)); });
    tLine.material.opacity = tw * 0.7;
    packet.position.copy(tCurve.getPoint((t * 0.18) % 1)); packet.material.opacity = tw;
    thought.rotation.y = Math.sin(t * 0.3) * 0.2;

    screenLight.intensity = 0.5 + (w('search') + w('team')) * 0.9 + face * 0.5;
    const rackBoost = 1 + w('junior') * 0.6;
    for (const l of leds) {
      const on = motion ? (Math.sin(t * (2 + l.k) + l.seed * 3) > -0.3 ? 1 : 0.15) : 1;
      l.m.color.setHex(l.k === 0 ? 0x86efac : 0xfdba74).multiplyScalar(on * rackBoost);
    }
    for (const m of spinners) m.rotation.y = t * 0.5;

    scene.updateMatrixWorld();
    for (const h of hotspots) {
      const k2 = at(h.chap);
      const vis = k2 < 0 ? 0 : Math.max(0, 1 - Math.abs(s - k2) * 2.2);
      if (vis <= 0) { h.el.style.opacity = 0; continue; }
      _p.copy(h.off).applyMatrix4(h.obj.matrixWorld).project(camera);
      const x = (_p.x * 0.5 + 0.5) * innerWidth, y = (-_p.y * 0.5 + 0.5) * innerHeight;
      h.el.style.opacity = _p.z < 1 ? vis : 0;
      h.el.style.transform = `translate(${(x - h.el.offsetWidth / 2).toFixed(1)}px,${(y - h.el.offsetHeight).toFixed(1)}px)`;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
