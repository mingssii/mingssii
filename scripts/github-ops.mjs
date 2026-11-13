import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OWNER = 'mingssii';
const PORTFOLIO_URL = `https://${OWNER}.github.io`;
const API_URL = `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=pushed`;
const START_MARKER = '<!-- AUTO-PORTFOLIO:START -->';
const END_MARKER = '<!-- AUTO-PORTFOLIO:END -->';

const ROOT = process.cwd();
const README_PATH = resolve(ROOT, 'README.md');
const HEALTH_PATH = resolve(ROOT, 'status/ecosystem-health.json');

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `${OWNER}-github-ops`,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchPublicRepos() {
  const res = await fetch(API_URL, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  }
  const repos = await res.json();
  return repos
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
}

async function checkUrl(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
        continue;
      }
      return { url, ok: res.ok, status: res.status };
    } catch (err) {
      if (method === 'GET') {
        return { url, ok: false, status: 0, error: err.message };
      }
    }
  }
  return { url, ok: false, status: 0, error: 'unreachable' };
}

function liveAppUrl(repo) {
  if (repo.name === OWNER) return null;
  if (repo.homepage && repo.homepage.trim()) return repo.homepage.trim();
  if (repo.has_pages) return `https://${OWNER}.github.io/${repo.name}/`;
  return null;
}

function auditRepo(repo) {
  const issues = [];
  if (!repo.description || !repo.description.trim()) {
    issues.push('missing_description');
  }
  if (!Array.isArray(repo.topics) || repo.topics.length === 0) {
    issues.push('missing_topics');
  }
  if (repo.has_pages && (!repo.homepage || !repo.homepage.trim())) {
    issues.push('missing_homepage_for_pages');
  }
  return issues;
}

function sanitizeCell(text) {
  return String(text || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function buildPortfolioTable(records) {
  const rows = records
    .filter((r) => r.name !== OWNER && r.name !== `${OWNER}.github.io`)
    .map((r) => {
      const repoLink = `[${r.name}](${r.html_url})`;
      const kind = r.live_url ? `[Live App](${r.live_url})` : 'Repository';
      const lang = r.language || 'Other';
      const topics = r.topics.slice(0, 3).map((t) => `\`${t}\``).join(' ') || '—';
      const status =
        r.live_check && !r.live_check.ok
          ? `Down (${r.live_check.status})`
          : r.hygiene_issues.length === 0
            ? 'Healthy'
            : `Needs ${r.hygiene_issues.join(', ')}`;
      return `| ${repoLink} | ${kind} | ${lang} | ${topics} | ${status} | ${sanitizeCell(r.description)} |`;
    });

  return [
    '| Project | Surface | Stack | Topics | Health | Summary |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function updateReadme(tableMarkdown) {
  const current = readFileSync(README_PATH, 'utf8');
  const startIdx = current.indexOf(START_MARKER);
  const endIdx = current.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Missing ${START_MARKER} ... ${END_MARKER} markers in README.md`);
  }
  const before = current.slice(0, startIdx + START_MARKER.length);
  const after = current.slice(endIdx);
  const next = `${before}\n${tableMarkdown}\n${after}`;
  if (next !== current) {
    writeFileSync(README_PATH, next, 'utf8');
    return true;
  }
  return false;
}

function writeHealthReport(report) {
  mkdirSync(dirname(HEALTH_PATH), { recursive: true });
  const next = JSON.stringify(report, null, 2) + '\n';
  let current = null;
  try {
    current = readFileSync(HEALTH_PATH, 'utf8');
  } catch {
    // file does not exist yet
  }
  if (next !== current) {
    writeFileSync(HEALTH_PATH, next, 'utf8');
    return true;
  }
  return false;
}

function writeStepSummary(report, checkedAt) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    `## ${OWNER} Ecosystem Ops Summary`,
    `- Checked at: \`${checkedAt}\``,
    `- Public repositories audited: **${report.summary.total_public_repos}**`,
    `- Hygiene compliant: **${report.summary.hygiene_passed}/${report.summary.total_public_repos}**`,
    `- Live endpoints healthy: **${report.summary.live_ok}/${report.summary.live_total}**`,
    '',
    '| Repository | Hygiene | Live Endpoint | Status |',
    '|---|---|---|---|',
    ...report.repositories.map((r) => {
      const hygiene = r.hygiene_issues.length === 0 ? 'Pass' : r.hygiene_issues.join(', ');
      const live = r.live_check ? `${r.live_check.url} (${r.live_check.status})` : '—';
      const ok = (!r.live_check || r.live_check.ok) && r.hygiene_issues.length === 0 ? 'OK' : 'Check';
      return `| \`${r.name}\` | ${hygiene} | ${live} | ${ok} |`;
    }),
    '',
  ];
  appendFileSync(summaryPath, lines.join('\n'), 'utf8');
}

async function main() {
  const checkedAt = new Date().toISOString();
  const repos = await fetchPublicRepos();

  const liveChecksMap = new Map();
  const urlsToCheck = new Set([PORTFOLIO_URL]);
  for (const repo of repos) {
    const url = liveAppUrl(repo);
    if (url) urlsToCheck.add(url);
  }

  const checkResults = await Promise.all(
    [...urlsToCheck].map(async (url) => [url, await checkUrl(url)])
  );
  for (const [url, result] of checkResults) {
    liveChecksMap.set(url, result);
  }

  const records = repos.map((repo) => {
    const url = liveAppUrl(repo);
    const hygieneIssues = auditRepo(repo);
    return {
      name: repo.name,
      html_url: repo.html_url,
      description: repo.description || '',
      language: repo.language || 'Other',
      topics: Array.isArray(repo.topics) ? [...repo.topics].sort() : [],
      has_pages: Boolean(repo.has_pages),
      homepage: repo.homepage || null,
      live_url: url,
      live_check: url ? liveChecksMap.get(url) : null,
      hygiene_issues: hygieneIssues,
    };
  });

  const liveChecks = [...liveChecksMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  const report = {
    owner: OWNER,
    portfolio_url: PORTFOLIO_URL,
    summary: {
      total_public_repos: records.length,
      hygiene_passed: records.filter((r) => r.hygiene_issues.length === 0).length,
      live_total: liveChecks.length,
      live_ok: liveChecks.filter((c) => c.ok).length,
    },
    live_checks: liveChecks,
    repositories: records,
  };

  const readmeChanged = updateReadme(buildPortfolioTable(records));
  const healthChanged = writeHealthReport(report);
  writeStepSummary(report, checkedAt);

  console.log(
    `Audited ${report.summary.total_public_repos} repos (${report.summary.hygiene_passed} hygiene pass), ` +
      `${report.summary.live_ok}/${report.summary.live_total} live endpoints OK. ` +
      `Changes: README=${readmeChanged}, health=${healthChanged}`
  );

  const failedLive = liveChecks.filter((c) => !c.ok);
  if (failedLive.length > 0) {
    console.error('Unreachable live endpoints:', failedLive);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
