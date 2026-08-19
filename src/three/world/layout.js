/**
 * The world: stations laid out as places in 3D space.
 *
 * Panels are real DOM elements docked into the scene. Their pixel width is
 * authored here in WORLD UNITS (CSS3D treats 1px as 1 unit, so the element is
 * given `width / PANEL_SCALE` pixels); their HEIGHT is measured after mount,
 * never assumed — resume copy reflows, and guessing heights would clip it.
 *
 * Panels within a station are COPLANAR — every offset has z = 0. A panel
 * staggered forward by z would render fov/(d-z) larger at the dock distance:
 * crisp, but the wrong size. Depth belongs between stations, not inside one.
 *
 * A panel is placed either by an explicit `offset`, or by `row`/`col` in the
 * station's auto-grid. Rows are centred independently, so a trailing row with
 * fewer panels still sits centred.
 *
 * Camera distance is COMPUTED from each station's measured extent (see
 * Stage.frameStation), so every station frames correctly on any viewport.
 * That is also why dense sections are split across SUB-STATIONS: framing six
 * project cards at once shrinks each one below reading size, so they get two
 * stops of three instead.
 *
 * `formation` indexes the particle shader's formation list, which is why it is
 * separate from the station index — consecutive sub-stations share a
 * formation, so the field holds its shape while you move between them.
 */

export const PANEL_SCALE = 0.02; // 1000px -> 20 world units

const PALETTE = {
  accent: '#00ed64',   // MongoDB green — primary
  accent2: '#ffb000',  // phosphor amber — metrics, place, time
  green: '#00ed64',
  orange: '#ff9900',   // AWS orange — infrastructure
};

export const STATIONS = [
  {
    id: 'hero',
    formation: 0,
    position: [0, 0, 0],
    view: [0, 0, 1],
    accent: PALETTE.accent,
    landmark: 'core',
    presence: { graph: 1.0, flow: 1.0, scale: 1.0 },
    panels: [{ select: '.hero-content', width: 19, offset: [0, 0, 0] }],
  },
  {
    id: 'terminal',
    formation: 1,
    position: [-26, -8, -68],
    view: [0.05, 0.04, 1],
    accent: PALETTE.accent,
    landmark: 'stream',
    presence: { graph: 0.45, flow: 1.3, scale: 1.0 },
    panels: [
      { select: '#terminal .station-head', width: 10.5, row: -1, col: 0, full: true },
      { select: '#term', width: 19, row: 0, col: 0 },
    ],
  },
  {
    id: 'about',
    formation: 2,
    position: [26, -18, -138],
    view: [-0.07, 0.04, 1],
    accent: PALETTE.accent2,
    landmark: 'orbit',
    presence: { graph: 0.5, flow: 0.7, scale: 1.15 },
    grid: { origin: [11.5, 0, 0], gap: 1.4 },
    panels: [
      { select: '.about-lede', width: 13.4, offset: [-10, 0, 0] },
      { select: '#about .hl-card:nth-of-type(1)', width: 6.6, row: 0, col: 0 },
      { select: '#about .hl-card:nth-of-type(2)', width: 6.6, row: 0, col: 1 },
      { select: '#about .hl-card:nth-of-type(3)', width: 6.6, row: 1, col: 0 },
      { select: '#about .hl-card:nth-of-type(4)', width: 6.6, row: 1, col: 1 },
    ],
  },
  {
    id: 'architecture',
    formation: 3,
    position: [4, -30, -210],
    view: [0.05, 0.04, 1],
    accent: PALETTE.orange,
    landmark: 'pipeline',
    presence: { graph: 0.55, flow: 1.1, scale: 1.05 },
    panels: [
      { select: '#architecture .station-head', width: 10.5, row: -1, col: 0, full: true },
      { select: '#arch-search', width: 15, row: 0, col: 0 },
    ],
  },
  {
    // The second diagram gets its own stop for the same reason the project
    // cards do: two dense diagrams framed together are two unreadable ones.
    id: 'architecture-2',
    formation: 3,
    position: [-24, -42, -282],
    view: [-0.06, 0.04, 1],
    accent: PALETTE.orange,
    landmark: 'pipeline',
    presence: { graph: 0.5, flow: 1.0, scale: 1.0 },
    panels: [
      { select: '#arch-interview', width: 15, offset: [0, 0, 0] },
    ],
  },
  {
    id: 'experience',
    formation: 4,
    position: [16, -54, -354],
    view: [0.07, 0.03, 1],
    accent: PALETTE.accent,
    landmark: 'spine',
    presence: { graph: 0.7, flow: 1.0, scale: 0.9 },
    grid: { origin: [2, -2.5, 0], gap: 1.6 },
    panels: [
      { select: '#experience .station-head', width: 11, row: -1, col: 0, full: true },
      { select: '#experience .tl-item:nth-of-type(1)', width: 17, row: 0, col: 0 },
    ],
  },
  {
    id: 'experience-2',
    formation: 4,
    position: [-14, -66, -426],
    view: [-0.07, 0.03, 1],
    accent: PALETTE.accent,
    landmark: 'spine',
    presence: { graph: 0.65, flow: 0.9, scale: 0.95 },
    grid: { origin: [0, 0, 0], gap: 1.6 },
    panels: [
      { select: '#experience .tl-item:nth-of-type(2)', width: 16.5, row: 0, col: 0 },
      { select: '#experience .tl-item:nth-of-type(3)', width: 16.5, row: 1, col: 0 },
    ],
  },
  {
    id: 'projects',
    formation: 5,
    position: [26, -80, -500],
    view: [0, 0.05, 1],
    accent: PALETTE.accent2,
    landmark: 'platforms',
    presence: { graph: 0.4, flow: 0.5, scale: 1.25 },
    grid: { origin: [0, -1.8, 0], gap: 1.4 },
    panels: [
      { select: '#projects .station-head', width: 11, row: -1, col: 0, full: true },
      { select: '#projects .proj-card:nth-of-type(1)', width: 9.5, row: 0, col: 0 },
      { select: '#projects .proj-card:nth-of-type(2)', width: 9.5, row: 0, col: 1 },
      { select: '#projects .proj-card:nth-of-type(3)', width: 9.5, row: 0, col: 2 },
    ],
  },
  {
    id: 'projects-2',
    formation: 5,
    position: [-4, -94, -574],
    view: [-0.06, 0.03, 1],
    accent: PALETTE.accent2,
    landmark: 'platforms',
    presence: { graph: 0.4, flow: 0.5, scale: 1.2 },
    grid: { origin: [0, 0, 0], gap: 1.4 },
    panels: [
      { select: '#projects .proj-card:nth-of-type(4)', width: 9.5, row: 0, col: 0 },
      { select: '#projects .proj-card:nth-of-type(5)', width: 9.5, row: 0, col: 1 },
      { select: '#projects .proj-card:nth-of-type(6)', width: 9.5, row: 0, col: 2 },
    ],
  },
  {
    id: 'skills',
    formation: 6,
    position: [-28, -108, -648],
    view: [0.06, 0.03, 1],
    accent: PALETTE.orange,
    landmark: 'lattice',
    presence: { graph: 0.3, flow: 0.4, scale: 1.1 },
    grid: { origin: [0, -2, 0], gap: 1.4 },
    panels: [
      { select: '#skills .station-head', width: 11, row: -1, col: 0, full: true },
      { select: '#skills .sk-group:nth-of-type(1)', width: 8.6, row: 0, col: 0 },
      { select: '#skills .sk-group:nth-of-type(2)', width: 8.6, row: 0, col: 1 },
      { select: '#skills .sk-group:nth-of-type(3)', width: 8.6, row: 0, col: 2 },
      { select: '#skills .sk-group:nth-of-type(4)', width: 8.6, row: 1, col: 0 },
      { select: '#skills .sk-group:nth-of-type(5)', width: 8.6, row: 1, col: 1 },
    ],
  },
  {
    id: 'contact',
    formation: 7,
    position: [0, -122, -722],
    view: [0, 0, 1],
    accent: PALETTE.accent,
    landmark: 'beacon',
    presence: { graph: 1.0, flow: 1.2, scale: 0.8 },
    panels: [{ select: '#contact .contact-card', width: 14, offset: [0, 0, 0] }],
  },
];

export const STATION_COUNT = STATIONS.length;

/** Ids the nav can link to — sub-stations are not separate destinations. */
export const STATION_IDS = STATIONS.map((s) => s.id);

/** Maps a nav anchor (#projects) to the station index it should fly to. */
export function stationIndexForAnchor(id) {
  return STATIONS.findIndex((s) => s.id === id);
}
