import { Color, Group, Vector3 } from 'three';
import { ParticleField, FORMATION_COUNT } from './ParticleField.js';
import { AgentGraph } from './AgentGraph.js';
import { SignalFlow } from './SignalFlow.js';
import { Landmarks } from './Landmarks.js';
import { STATIONS, STATION_COUNT } from './layout.js';

// Stations outnumber formations — dense sections get several stops that share
// one formation — but every station must still name a formation the shader has.
{
  const bad = STATIONS.filter((s) => s.formation >= FORMATION_COUNT || s.formation < 0);
  if (bad.length) {
    throw new Error(
      `World: station(s) ${bad.map((s) => s.id).join(', ')} reference a formation ` +
      `outside 0..${FORMATION_COUNT - 1}`
    );
  }
}

const PALETTE = {
  accent: '#00ed64',   // MongoDB green — primary
  accent2: '#ffb000',  // phosphor amber — metrics, place, time
  green: '#00ed64',
  orange: '#ff9900',   // AWS orange — infrastructure
};

/** How much of the field's brightness survives while you are parked reading. */
const DOCKED_LEVEL = 0.44;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class World {
  constructor({ scene, settings, pixelRatio, stations }) {
    this.scene = scene;
    this.pixelRatio = pixelRatio;

    // Travelling layers: these follow the viewer, so the world is dense
    // wherever you happen to be rather than only near the origin.
    this.travelling = new Group();
    // Fixed layers: real places that stay put as you fly past them.
    this.fixed = new Group();
    scene.add(this.travelling, this.fixed);

    this.landmarks = new Landmarks({ stations });
    this.fixed.add(this.landmarks.group);

    this.intro = 0;
    this._cursorLocal = new Vector3();
    this._hue = new Color(PALETTE.accent);
    this._hueA = new Color();
    this._hueB = new Color();

    this.build(settings);
  }

  build(settings) {
    this.settings = settings;

    this.particles = new ParticleField({
      count: settings.particles,
      pixelRatio: this.pixelRatio,
      palette: PALETTE,
    });

    this.graph = new AgentGraph({
      nodeCount: settings.graphNodes,
      edgeCount: settings.graphEdges,
      palette: PALETTE,
    });

    this.flow = new SignalFlow({
      count: settings.pulses,
      graph: this.graph,
      palette: PALETTE,
    });
    this.flow.setPixelRatio(this.pixelRatio);
    this.graph.group.add(this.flow.mesh);

    this.travelling.add(this.particles.mesh, this.graph.group);
  }

  rebuild(settings) {
    this.travelling.remove(this.particles.mesh, this.graph.group);
    this.particles.dispose();
    this.flow.dispose();
    this.graph.dispose();
    this.build(settings);
  }

  setPixelRatio(value) {
    this.pixelRatio = value;
    this.particles.setPixelRatio(value);
    this.flow.setPixelRatio(value);
  }

  update({ elapsed, delta, journey, velocity, cursorWorld, fieldCenter, transit = 0 }) {
    this.intro = Math.min(this.intro + delta * 0.9, 1);
    const intro = this.intro * this.intro * (3 - this.intro * 2);

    // Calm while docked, vivid while flying. After docking itself this is the
    // biggest readability win: the field stops competing with the text exactly
    // when you are trying to read it.
    const liveliness = DOCKED_LEVEL + (1 - DOCKED_LEVEL) * transit;

    // `from` + `blend` describe the leg being flown; at a dock, blend is 0 and
    // the field holds that station's formation exactly.
    const { from = 0, blend = 0 } = journey;
    const index = Math.min(from, STATION_COUNT - 1);
    const next = Math.min(index + 1, STATION_COUNT - 1);

    // Blend between the two stations' formations rather than between station
    // indices — sub-stations sharing a formation therefore hold their shape.
    const morph = lerp(STATIONS[index].formation, STATIONS[next].formation, blend);

    // The travelling layers sit a fixed distance ahead of the camera, well
    // beyond the dock plane, so the field is always around you but never in
    // the space the panels occupy.
    this.travelling.position.copy(fieldCenter);

    this._hueA.set(STATIONS[index].accent);
    this._hueB.set(STATIONS[next].accent);
    this._hue.copy(this._hueA).lerp(this._hueB, blend);
    this.particles.material.uniforms.uColorA.value.copy(this._hue);

    this.particles.update({ elapsed, morph, velocity, opacity: intro * liveliness });

    let cursor = null;
    if (cursorWorld) {
      cursor = this._cursorLocal.copy(cursorWorld);
      this.graph.group.worldToLocal(cursor);
    }

    const a = STATIONS[index].presence;
    const b = STATIONS[next].presence;

    this.graph.update({
      elapsed,
      cursor,
      opacity: lerp(a.graph, b.graph, blend) * intro * liveliness,
      scale: lerp(a.scale, b.scale, blend),
    });

    this.flow.update({
      delta,
      velocity,
      opacity: lerp(a.flow, b.flow, blend) * intro * liveliness,
    });

    this.landmarks.update(elapsed);
  }

  dispose() {
    this.particles.dispose();
    this.flow.dispose();
    this.graph.dispose();
    this.landmarks.dispose();
    this.scene.remove(this.travelling, this.fixed);
  }
}
