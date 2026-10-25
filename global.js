/* ═════════════════════════════════════════════════════════════════
   DOSSIER · global.js — loaded on every page
   Lab 3
   - $$:               querySelectorAll → array
   - nav:              built from `pages`, current page auto-highlighted
   - theme switcher:   automatic / light / dark, saved in localStorage
   - contact form:     mailto: URL with encoded subject + body
   Lab 4
   - fetchJSON:        fetch + parse a JSON file or API endpoint
   - renderProjects:   template project objects into <article>s
   - fetchGitHubData:  public profile data from the GitHub API
   ═════════════════════════════════════════════════════════════════ */

console.log('IT’S ALIVE!');

export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/* ── navigation ───────────────────────────────────────── */
const pages = [
  { url: '',                                title: 'home' },
  { url: 'projects/',                       title: 'projects' },
  { url: 'contact/',                        title: 'contact' },
  { url: 'resume/',                         title: 'resume' },
  { url: 'https://github.com/KylanHuynh7', title: 'github ↗' },
];

const BASE_PATH = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? '/'            // local server
  : '/portfolio/'; // GitHub Pages repo name

const nav = document.createElement('nav');
nav.className = 'scoreboard__nav';
nav.setAttribute('aria-label', 'Primary');

let pageNum = 0;
for (let p of pages) {
  let url = p.url;
  let title = p.title;
  url = !url.startsWith('http') ? BASE_PATH + url : url;

  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;

  // internal pages get the scoreboard's "01 " numbering
  if (a.host === location.host) {
    const num = document.createElement('span');
    num.className = 'nav__num';
    num.textContent = `${String(++pageNum).padStart(2, '0')} `;
    a.prepend(num);
  }

  const isCurrent = a.host === location.host && a.pathname === location.pathname;
  a.classList.toggle('current', isCurrent);
  if (isCurrent) a.setAttribute('aria-current', 'page');

  if (a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  nav.append(a);
}

// the nav lives in the scoreboard header; fall back to the top of <body>
const scoreboard = document.querySelector('.scoreboard');
if (scoreboard) scoreboard.append(nav);
else document.body.prepend(nav);

/* ── theme switcher ───────────────────────────────────── */
const osScheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic (${osScheme})</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
);

const select = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', (event) => {
  setColorScheme(event.target.value);
  localStorage.colorScheme = event.target.value;
});

/* ── contact form → mailto: ───────────────────────────── */
const form = document.querySelector('.contact-form');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const params = [];
  for (let [name, value] of data) {
    params.push(`${name}=${encodeURIComponent(value)}`);
  }
  location.href = `${form.action}?${params.join('&')}`;
});

/* ── Lab 4 ────────────────────────────────────────────── */
const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!(containerElement instanceof Element)) {
    console.error('renderProjects: container element not found.');
    return;
  }
  if (!HEADING_LEVELS.includes(headingLevel)) {
    console.warn(`renderProjects: invalid heading level "${headingLevel}", using h2.`);
    headingLevel = 'h2';
  }

  containerElement.innerHTML = '';

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p class="projects__empty">No projects to show yet.</p>';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');
    article.innerHTML = `
      <${headingLevel}>${project.title ?? 'Untitled project'}</${headingLevel}>
      <img src="${project.image ?? 'https://vis-society.github.io/labs/2/images/empty.svg'}" alt="${project.title ?? ''}" />
      <p>${project.description ?? ''}</p>
    `;
    containerElement.appendChild(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
