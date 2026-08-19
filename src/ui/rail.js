import { STATIONS } from '../three/world/layout.js';
import { goToStation, onScroll } from './scroll.js';

const TITLE = {
  hero: 'Start',
  terminal: 'Shell',
  about: 'About',
  architecture: 'Systems',
  'architecture-2': 'Systems — interview agent',
  experience: 'Experience',
  'experience-2': 'Experience — earlier roles',
  projects: 'Projects',
  'projects-2': 'Projects — continued',
  skills: 'Skills',
  contact: 'Contact',
};

/**
 * Station rail: the only orientation cue you get once the page stops being a
 * page. Shows where you are in the world and lets you jump.
 */
export function initRail() {
  const rail = document.querySelector('.world-rail');
  if (!rail) return () => {};

  const buttons = STATIONS.map((station, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    if (station.id.includes('-')) button.classList.add('is-sub');
    const label = TITLE[station.id] ?? station.id;
    button.setAttribute('aria-label', `Go to ${label}`);
    button.title = label;
    button.addEventListener('click', () => goToStation(i));
    rail.appendChild(button);
    return button;
  });

  let current = -1;
  return onScroll(({ index }) => {
    if (index === current) return;
    current = index;
    buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
  });
}
