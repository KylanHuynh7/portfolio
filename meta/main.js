import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

/* ═════════════════════════════════════════════════════════════════
   META · stats about this site's own code
   Lab 6: summary stats, commit scatterplot, tooltip, brushing
   Lab 8: time slider, file unit visualization, scrollytelling
   loc.csv has one row per line of code, made with:
     npx elocuent -d . -o meta/loc.csv --spaces 2
   ═════════════════════════════════════════════════════════════════ */

const REPO_URL = 'https://github.com/KylanHuynh7/portfolio';

// the scales are shared by the scatterplot, its updates and the brush
let xScale;
let yScale;

/* ── Lab 6 Step 1.1 · read the CSV, converting strings to numbers / dates ── */
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

/* ── Lab 6 Step 1.2 · one object per commit ───────────────────────── */
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      // every line in a commit shares its author and timestamps
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,
        url: `${REPO_URL}/commit/${commit}`,
        author,
        date,
        time,
        timezone,
        datetime,
        // hour as a decimal, e.g. 2:30 PM = 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // keep the raw lines, but hidden so they don't clutter console output
      Object.defineProperty(ret, 'lines', {
        value: lines,
        writable: false,
        configurable: false,
        enumerable: false,
      });

      return ret;
    })
    // oldest first, so the story (Lab 8) reads in order
    .sort((a, b) => a.datetime - b.datetime);
}

/* ── Lab 6 Step 1.3 · summary stats ───────────────────────────────── */
// Called again whenever the time filter changes (Lab 8), so it clears first.
function renderCommitInfo(data, commits) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();
  const dl = container.append('dl').attr('class', 'stats');

  const addStat = (label, value) => {
    dl.append('dt').html(label);
    dl.append('dd').text(value);
  };

  addStat('Commits', commits.length);
  addStat('Files', d3.group(data, (d) => d.file).size);
  addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);
  addStat('Max depth', d3.max(data, (d) => d.depth));
  addStat('Longest line', d3.max(data, (d) => d.length));

  // grouped aggregate: number of lines in each file, then the mean of those
  const fileLengths = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.file,
  );
  addStat('Avg file length', Math.round(d3.mean(fileLengths, (d) => d[1])));

  // the period of the day with the most lines written
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  addStat('Most work', maxPeriod?.replace(/^(in the|at) /, '') ?? '—');
}

/* ── Lab 6 Step 2 · scatterplot of commits: date × time of day ────── */
const width = 1000;
const height = 600;
const margin = { top: 10, right: 30, bottom: 40, left: 70 };

const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // gridlines go in first so they sit behind everything else
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  // the classes let updateScatterPlot() find the axis again (Lab 8)
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis');

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  svg.append('g').attr('class', 'dots');

  // the x axis and the dots are the parts that change, so one function draws both
  updateScatterPlot(data, commits);

  createBrushSelector(svg);
}

/* ── Lab 8 Step 1.2 · redraw the x axis and dots for a set of commits ── */
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  let [minTime, maxTime] = d3.extent(commits, (d) => d.datetime);
  if (+minTime === +maxTime) {
    // a single commit has no time range to draw, so show the day it was made
    minTime = d3.timeDay.floor(minTime);
    maxTime = d3.timeDay.offset(minTime, 1);
  }
  xScale = xScale.domain([minTime, maxTime]).nice();

  // replace the old x axis instead of stacking a new one on top
  // (fewer ticks than the default, so the labels do not collide)
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale).ticks(6));

  // Lab 6 Step 4 · dot AREA shows lines edited, so use a square-root scale
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([4, 30]);

  // biggest first, so small dots are drawn on top and stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id) // key: the same commit keeps the same circle
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('--r', (d) => rScale(d.totalLines)) // lets CSS grow big dots more slowly
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

/* ── Lab 6 Step 3 · tooltip ───────────────────────────────────────── */
function renderTooltipContent(commit) {
  if (Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-tooltip-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  time.textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  // keep the tooltip on screen when the cursor is near the right or bottom edge
  const { offsetWidth, offsetHeight } = tooltip;
  const x = Math.min(event.clientX + 14, window.innerWidth - offsetWidth - 8);
  const y = Math.min(event.clientY + 14, window.innerHeight - offsetHeight - 8);
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

/* ── Lab 6 Step 5 · brushing ──────────────────────────────────────── */
let brush;

function createBrushSelector(svg) {
  brush = d3.brush().on('start brush end', brushed);
  svg.call(brush);

  // the brush overlay would cover the dots and swallow their hover events,
  // so move the dots (and everything after the overlay) back on top
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [x0, x1] = selection.map((d) => d[0]);
  const [y0, y1] = selection.map((d) => d[1]);
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// only the commits currently drawn can be selected
function getSelectedCommits(selection) {
  return selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
}

function renderSelectionCount(selection) {
  const selectedCommits = getSelectedCommits(selection);

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commit${
    selectedCommits.length === 1 ? '' : 's'
  } selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = getSelectedCommits(selection);
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  // count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines <small>(${formatted})</small></dd>
    `;
  }
}

/* ── Lab 8 Step 2 · unit visualization: one dot per line, per file ── */
// one color per language (css / js / html …)
let colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length); // biggest file first

  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      // This code only runs when the div is initially rendered
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt');
          div.append('dd');
        }),
    )
    .order(); // keep the DOM order in step with the sort

  // This code updates the div info
  filesContainer
    .select('dt')
    .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  // append one div for each line
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

/* ── go ───────────────────────────────────────────────────────────── */
let data = await loadData();
let commits = processCommits(data);

/* ── Lab 8 Step 1 · time filter ───────────────────────────────────── */
// how far through the project's history we are showing, as a percentage
let commitProgress = 100;

let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

// Will get updated as user changes slider
let filteredCommits = commits;

const timeSlider = document.getElementById('commit-progress');
const timeDisplay = document.getElementById('commit-time');

// Everything on the page that depends on the time filter is redrawn here,
// so the slider and the scrolling story share one code path.
function showCommitsUntil(maxTime) {
  commitMaxTime = maxTime;
  commitProgress = timeScale(commitMaxTime);

  timeSlider.value = commitProgress;
  timeDisplay.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredLines = filteredCommits.flatMap((d) => d.lines);

  // the brush rectangle no longer matches once the dots move, so clear it
  // (this also resets the selection count and language breakdown)
  const svg = d3.select('#chart').select('svg');
  if (brush && d3.brushSelection(svg.node())) svg.call(brush.move, null);

  renderCommitInfo(filteredLines, filteredCommits);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  showCommitsUntil(timeScale.invert(Number(timeSlider.value)));
}

renderScatterPlot(data, commits);
timeSlider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

/* ── Lab 8 Step 3 · scrollytelling ────────────────────────────────── */
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html((d, i) => {
    const fileCount = d3.rollups(
      d.lines,
      (D) => D.length,
      (d) => d.file,
    ).length;
    const when = d.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    return `
      <p>
        On ${when}, I made
        <a href="${d.url}" target="_blank" rel="noopener noreferrer">${
          i > 0 ? 'another commit' : 'my first commit'
        }</a>.
        ${d.totalLines} of its lines ${d.totalLines === 1 ? 'is' : 'are'} still in the site today, across
        ${fileCount} file${fileCount === 1 ? '' : 's'}.
      </p>
    `;
  });

// each time a step crosses the middle of the screen, show the site as of that commit
function onStepEnter(response) {
  showCommitsUntil(response.element.__data__.datetime);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);

window.addEventListener('resize', () => scroller.resize());
