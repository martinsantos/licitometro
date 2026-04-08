// Manual search — fetches search-index.json and provides fuzzy results
// No external dependencies, no innerHTML

let searchIndex = null;

async function loadIndex() {
  if (searchIndex) return searchIndex;
  try {
    const res = await fetch('/manual/data/search-index.json');
    if (!res.ok) return [];
    searchIndex = await res.json();
    return searchIndex;
  } catch (e) {
    return [];
  }
}

function scoreEntry(entry, query) {
  const q = query.toLowerCase();
  const title = (entry.title || '').toLowerCase();
  const content = (entry.content || '').toLowerCase();
  const section = (entry.section || '').toLowerCase();

  let score = 0;
  if (title.includes(q)) score += 10;
  if (title.startsWith(q)) score += 5;
  if (section.includes(q)) score += 3;

  // Word matches in content
  const words = q.split(/\s+/).filter(w => w.length >= 2);
  for (const w of words) {
    if (content.includes(w)) score += 1;
    if (title.includes(w)) score += 3;
  }
  return score;
}

function search(query, idx) {
  if (!query || query.length < 2) return [];
  const scored = idx.map(e => ({ entry: e, score: scoreEntry(e, query) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return scored.map(s => s.entry);
}

function renderResults(results, container) {
  while (container.firstChild) container.removeChild(container.firstChild);
  if (results.length === 0) {
    container.classList.remove('active');
    return;
  }
  for (const r of results) {
    const link = document.createElement('a');
    link.href = r.url;
    const titleSpan = document.createElement('div');
    titleSpan.textContent = r.title;
    const sectionSpan = document.createElement('div');
    sectionSpan.className = 'result-section';
    sectionSpan.textContent = r.section || '';
    link.appendChild(titleSpan);
    link.appendChild(sectionSpan);
    container.appendChild(link);
  }
  container.classList.add('active');
}

function debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

window.initSearch = function() {
  const input = document.getElementById('manual-search');
  const results = document.getElementById('search-results');
  if (!input || !results) return;

  const handle = debounce(async (q) => {
    const idx = await loadIndex();
    const matches = search(q, idx);
    renderResults(matches, results);
  }, 200);

  input.addEventListener('input', (e) => handle(e.target.value));
  input.addEventListener('blur', () => {
    setTimeout(() => results.classList.remove('active'), 200);
  });
  input.addEventListener('focus', (e) => {
    if (e.target.value.length >= 2) handle(e.target.value);
  });
};
