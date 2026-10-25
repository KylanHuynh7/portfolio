import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

// project count in the page title + section meta
const count = Array.isArray(projects) ? projects.length : 0;
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle) projectsTitle.textContent = `${count} Projects`;
const projectsMeta = document.querySelector('#projects-count');
if (projectsMeta) projectsMeta.textContent = `N = ${count}`;
