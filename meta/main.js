import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

/* ═════════════════════════════════════════════════════════════════
   META · stats about this site's own code (Lab 6)
   loc.csv has one row per line of code, made with:
     npx elocuent -d . -o meta/loc.csv --spaces 2
   ═════════════════════════════════════════════════════════════════ */

const REPO_URL = 'https://github.com/KylanHuynh7/portfolio';

// the scales are shared by the scatterplot and the brush, so they live out here
let xScale;
let yScale;

/* ── Step 1.1 · read the CSV, converting strings to numbers / dates ── */
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

/* ── Step 1.2 · one object per commit ─────────────────────────────── */
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
    });
}

/* ── Step 1.3 · summary stats ─────────────────────────────────────── */
function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  const addStat = (label, value) => {
    dl.append('dt').html(label);
    dl.append('dd').text(value);
  };

  addStat('Commits', commits.length);
  addStat('Files', d3.group(data, (d) => d.file).size);
  addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);
  addStat('Max depth', d3.max(data, (d) => d.depth));
  addStat('Longest line', d3.max(data, (d) => d.length));

  // grouped aggregate: length of each file, then the mean of those
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
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

/* ── Step 2 · scatterplot of commits: date × time of day ──────────── */
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 30, bottom: 30, left: 50 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

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

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Step 4 · dot AREA shows lines edited, so use a square-root scale
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([4, 30]);

  // biggest first, so small dots are drawn on top and stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
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

  createBrushSelector(svg);
}

/* ── Step 3 · tooltip ─────────────────────────────────────────────── */
function renderTooltipContent(commit) {
  if (Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time');
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

/* ── Step 5 · brushing ────────────────────────────────────────────── */
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));

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

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commit${
    selectedCommits.length === 1 ? '' : 's'
  } selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
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

/* ── go ───────────────────────────────────────────────────────────── */
let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
