import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

// project count in the page title
const count = Array.isArray(projects) ? projects.length : 0;
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle) projectsTitle.textContent = `${count} Projects`;
const projectsMeta = document.querySelector('#projects-count');

/* ── Lab 5 · pie chart of projects per year ───────────── */
const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
// colors are keyed by year, so a year keeps its color when a search removes other wedges
const colors = d3.scaleOrdinal(d3.schemeTableau10);

let query = '';
// the selected wedge is tracked by its year label (not its index), so the
// selection survives the pie being redrawn with different wedges after a search
let selectedYear = null;

// Step 5.4 fix: both filters are applied together, in one place.
// The pie is drawn from the search results only, so its wedges always
// describe what the search is showing; the list then also applies the year.
function update() {
  const searched = (projects ?? []).filter((project) => {
    // search every field except the image URL (it contains "labs" for every project)
    const { image, ...searchable } = project;
    const values = Object.values(searchable).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });

  renderPieChart(searched);

  const visible = selectedYear === null
    ? searched
    : searched.filter((project) => project.year === selectedYear);

  renderProjects(visible, projectsContainer, 'h2');
  if (projectsMeta) projectsMeta.textContent = `N = ${visible.length}`;
}

function renderPieChart(projectsGiven) {
  const rolledData = d3.rollups(projectsGiven, (v) => v.length, (d) => d.year);
  const data = rolledData
    .map(([year, count]) => ({ value: count, label: year }))
    .sort((a, b) => d3.ascending(a.label, b.label));

  // drop a selection whose year no longer has any matching projects
  if (!data.some((d) => d.label === selectedYear)) selectedYear = null;

  const sliceGenerator = d3.pie().value((d) => d.value).sort(null);
  const arcData = sliceGenerator(data);

  // clear the previous render
  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  arcData.forEach((d) => {
    svg
      .append('path')
      .attr('d', arcGenerator(d))
      .attr('fill', colors(d.data.label))
      .classed('selected', d.data.label === selectedYear)
      .on('click', () => toggleYear(d.data.label))
      .append('title')
      .text(`${d.data.label}: ${d.data.value} project${d.data.value === 1 ? '' : 's'}`);
  });

  data.forEach((d) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', 'legend-item')
      .classed('selected', d.label === selectedYear)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => toggleYear(d.label));
  });
}

function toggleYear(year) {
  selectedYear = selectedYear === year ? null : year;
  update();
}

/* ── search ───────────────────────────────────────────── */
const searchInput = document.querySelector('.searchBar');
searchInput?.addEventListener('input', (event) => {
  query = event.target.value;
  update();
});

update();
