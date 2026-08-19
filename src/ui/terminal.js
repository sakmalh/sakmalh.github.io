/**
 * An interactive shell that answers from the same facts as the rest of the
 * page. Decorative terminals are a cliché; this one is here because the
 * fastest way to learn something specific about someone should be to ask.
 */

const PROFILE = {
  name: 'Akmal Hameed',
  role: 'Full-stack engineer, backend focus — agentic systems',
  location: 'Queens, New York',
  since: 'September 2022',
  email: 's.hameedakmal@gmail.com',
  phone: '203-997-4545',
  github: 'github.com/sakmalh',
  linkedin: 'linkedin.com/in/akmalhameed',
};

const STACK = [
  ['agents', 'LangGraph · Claude API · MCP · RAG · prompt engineering'],
  ['backend', 'Python · FastAPI · async pipelines · WebSockets · GraphQL'],
  ['data', 'MongoDB (Atlas Vector Search) · PostgreSQL · Redis · Pinecone'],
  ['infra', 'AWS (EC2, SQS, ECS, Lambda, S3, OpenSearch, IAM) · Kubernetes · Helm · Kops · Docker'],
  ['observability', 'Prometheus · Grafana · Datadog'],
  ['frontend', 'React · TypeScript · Next.js · Vue · Tailwind'],
  ['daily driver', 'Linux · bash · tmux'],
];

const ROLES = [
  ['Sept 2024 – now', 'Software Engineer', 'HiAcuity', 'Agent graphs, multi-tenant RAG, billing, live transcription'],
  ['Mar 2023 – Sept 2024', 'Junior Software Engineer', 'HiAcuity', '6-service standardisation, cloud cost reduction'],
  ['Sept 2022 – Mar 2023', 'Software Engineering Intern', 'HiAcuity', 'Test automation, secure FastAPI RBAC'],
];

const PROJECTS = [
  ['AI Resume Search', 'LangGraph + Pinecone + Mongo filters over 10K+ resumes'],
  ['Agentic-Map', 'Multi-agent trip resolver — Scout/Navigator/Concierge, human-in-the-loop'],
  ['AgentTrace', 'LLM agent observability — live trace trees over WebSockets'],
  ['DevTools MCP Server', 'GitHub + CI exposed to Claude via typed tool schemas'],
  ['HouseDiffusion', 'Diffusion + Transformer floor plans in under 5s'],
  ['Assignment Reminder', 'Selenium LMS tracker, WhatsApp alerts, 30+ students'],
];

const BANNER = String.raw`
   _   _                    _
  /_\ | |___ __  __ _ _ _  | |
 / _ \| / / '  \/ _' | | | |_|
/_/ \_\_\_\_|_|_\__,_|_|_| (_)
`;

function esc(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Two-column key/value rows, the shape most of these answers want. */
function rows(pairs) {
  return pairs
    .map(([k, v]) => `<span class="t-row"><span class="t-k">${esc(k)}</span><span class="t-v">${esc(v)}</span></span>`)
    .join('');
}

const COMMANDS = {
  help: () =>
    `Available commands:${rows([
      ['whoami', 'who I am and what I do'],
      ['stack', 'what I build with'],
      ['experience', 'roles and dates'],
      ['projects', 'things I have shipped'],
      ['architecture', 'how the production systems fit together'],
      ['education', 'degrees'],
      ['uptime', 'time in the industry'],
      ['contact', 'how to reach me'],
      ['neofetch', 'the usual'],
      ['clear', 'clear the screen'],
    ])}<span class="t-hint">Tab completes · ↑ ↓ walks history</span>`,

  whoami: () =>
    `${esc(PROFILE.name)}${rows([
      ['role', PROFILE.role],
      ['based', PROFILE.location],
      ['shipping since', PROFILE.since],
      ['status', 'open to new roles'],
    ])}<span class="t-p">I like problems that stay hard after the demo — the ones where correctness, latency and cost all pull in different directions. Most of my work lives in that gap.</span>`,

  stack: () => rows(STACK),

  experience: () =>
    ROLES.map(
      ([when, title, org, what]) =>
        `<span class="t-row"><span class="t-k">${esc(when)}</span><span class="t-v"><b>${esc(title)}</b> · ${esc(org)}<br><span class="t-dim">${esc(what)}</span></span></span>`
    ).join(''),

  projects: () => rows(PROJECTS),

  architecture: () =>
    `Two production systems I own:${rows([
      ['candidate search', 'query → LangGraph routing → Mongo filters ∥ Atlas Vector → Voyage rerank'],
      ['', 'sub-second across 100K+ profiles; tenancy enforced at the filter layer'],
      ['interview agent', 'Recall transcription → LangGraph competency blocks → fairness critic → structured scores'],
    ])}<span class="t-hint">The full diagrams are one station up — try the nav, or scroll.</span>`,

  education: () =>
    rows([
      ['2023 – 2024', 'B.Sc. Computer Science, First Class Honours — Staffordshire University (APIIT)'],
      ['2021 – 2022', 'HND Computer Science, Merit — Pearson (BCAS)'],
    ]),

  uptime: () => {
    const start = new Date('2022-09-01T00:00:00Z');
    const days = Math.floor((Date.now() - start) / 86400000);
    const years = (days / 365.25).toFixed(1);
    return rows([
      ['in production', `${years} years (${days.toLocaleString()} days)`],
      ['companies', '1'],
      ['titles', '3'],
      ['load', 'still enjoying it'],
    ]);
  },

  contact: () =>
    rows([
      ['email', PROFILE.email],
      ['phone', PROFILE.phone],
      ['github', PROFILE.github],
      ['linkedin', PROFILE.linkedin],
      ['timezone', 'America/New_York'],
    ]),

  neofetch: () =>
    `<span class="t-fetch"><span class="t-art">${esc(BANNER.replace(/^\n/, ''))}</span><span class="t-fetch-info">${rows([
      ['user', 'akmal@queens-nyc'],
      ['os', 'Linux (daily driver)'],
      ['role', 'Backend / agentic systems'],
      ['uptime', '4+ yrs in production'],
      ['db', 'MongoDB'],
      ['cloud', 'AWS'],
      ['shell', 'bash'],
      ['editor', 'the one that opens fastest'],
    ])}</span></span>`,
};

const ALIASES = { ls: 'help', '?': 'help', who: 'whoami', me: 'whoami', work: 'experience', skills: 'stack', arch: 'architecture', email: 'contact' };
const NAMES = Object.keys(COMMANDS);

/**
 * Re-pin the log to its latest line. Moving a node in the DOM resets the
 * scroll position of its scrollable descendants, and in world mode the whole
 * terminal gets re-parented into the CSS3D container after this module runs —
 * without this, the shell renders scrolled to the top and visibly clipped.
 */
export function pinTerminal() {
  const out = document.getElementById('term-out');
  if (out) requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; });
}

export function initTerminal() {
  const form = document.getElementById('term-form');
  const input = document.getElementById('term-in');
  const out = document.getElementById('term-out');
  if (!form || !input || !out) return;

  // Also re-pin whenever the box is resized (world mode restyles it).
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { out.scrollTop = out.scrollHeight; }).observe(out);
  }

  const history = [];
  let cursor = -1;

  function write(html, className = '') {
    const line = document.createElement('div');
    line.className = `t-line ${className}`.trim();
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function echo(cmd) {
    write(
      `<span class="term-ps1"><span class="ps1-user">akmal@queens-nyc</span><span class="ps1-punc">:</span><span class="ps1-path">~</span><span class="ps1-punc">$</span></span> ${esc(cmd)}`,
      't-echo'
    );
  }

  function run(raw) {
    const cmd = raw.trim().toLowerCase();
    if (!cmd) return;

    echo(raw.trim());
    history.push(raw.trim());
    cursor = history.length;

    if (cmd === 'clear') {
      out.replaceChildren();
      return;
    }

    const resolved = ALIASES[cmd] ?? cmd;
    const handler = COMMANDS[resolved];

    if (handler) write(handler());
    else write(`<span class="t-err">command not found: ${esc(cmd)}</span> — try <b>help</b>`);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
    input.value = '';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const partial = input.value.trim().toLowerCase();
      const match = NAMES.find((n) => n.startsWith(partial));
      if (partial && match) input.value = match;
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      cursor = e.key === 'ArrowUp'
        ? Math.max(0, cursor - 1)
        : Math.min(history.length, cursor + 1);
      input.value = history[cursor] ?? '';
    }
  });

  // Clicking anywhere in the shell focuses the prompt, as it would in a real one.
  document.getElementById('term')?.addEventListener('click', (e) => {
    if (window.getSelection()?.toString()) return; // don't steal a text selection
    input.focus();
  });

  write(`<span class="t-dim">akmal.sh — type <b>help</b> to begin.</span>`);
  run('whoami');
}
