import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OWNER = 'mingssii';
const PORTFOLIO_URL = `https://${OWNER}.github.io`;
const USER_API_URL = `https://api.github.com/users/${OWNER}`;
const REPOS_API_URL = `${USER_API_URL}/repos?per_page=100&sort=pushed`;
const ALERT_ISSUE_TITLE = '[Ecosystem Ops] Automated Health & Hygiene Alert';
const SECRET_FILE_RE = /(^|\/)(\.env|key\.txt|secret\.txt|\.clasp\.json|credentials\.json|id_rsa)$|\.(pem|key)$/i;
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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${url} returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function auditProfile() {
  const user = await fetchJson(USER_API_URL);
  const issues = [];
  const blog = (user.blog || '').trim();
  const hasBio = Boolean(user.bio && user.bio.trim());
  if (blog !== PORTFOLIO_URL) {
    issues.push('profile_blog_mismatch');
  }
  if (!hasBio) {
    issues.push('missing_profile_bio');
  }
  return {
    ok: issues.length === 0,
    blog,
    has_bio: hasBio,
    issues,
  };
}

async function fetchPublicRepos() {
  const repos = await fetchJson(REPOS_API_URL);
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

async function auditRepo(repo) {
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

  const secretFiles = [];
  const tree = await fetchJson(`https://api.github.com/repos/${OWNER}/${repo.name}/git/trees/HEAD?recursive=1`);
  for (const entry of tree.tree || []) {
    if (entry.type === 'blob' && SECRET_FILE_RE.test(entry.path)) {
      secretFiles.push(entry.path);
    }
  }
  if (secretFiles.length > 0) {
    issues.push('forbidden_secret_file');
  }

  const readmeRes = await fetch(`https://api.github.com/repos/${OWNER}/${repo.name}/readme`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (readmeRes.status === 404) {
    issues.push('missing_readme');
  } else if (!readmeRes.ok) {
    throw new Error(`GitHub API readme for ${repo.name} returned ${readmeRes.status}`);
  } else {
    const readmeObj = await readmeRes.json();
    const content = Buffer.from(readmeObj.content || '', 'base64').toString('utf8');
    if (content.includes('mingssii2')) {
      issues.push('legacy_handle_in_readme');
    }
  }

  return { issues, secretFiles };
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

function buildFailureBody(report) {
  const lines = [
    'Automated checks in **Ecosystem Ops & Portfolio Sync** detected issues requiring attention:',
    '',
  ];
  if (!report.profile_check.ok) {
    lines.push(`- **Profile Check Failed:** ${report.profile_check.issues.join(', ')} (blog=\`${report.profile_check.blog}\`)`);
  }
  const badRepos = report.repositories.filter((r) => r.hygiene_issues.length > 0);
  if (badRepos.length > 0) {
    lines.push('- **Repository Hygiene / Security Issues:**');
    for (const r of badRepos) {
      const secretsNote = r.secret_files.length > 0 ? ` — secret files: \`${r.secret_files.join('`, `')}\`` : '';
      lines.push(`  - \`${r.name}\`: ${r.hygiene_issues.join(', ')}${secretsNote}`);
    }
  }
  const failedLive = report.live_checks.filter((c) => !c.ok);
  if (failedLive.length > 0) {
    lines.push('- **Unreachable Live Endpoints:**');
    for (const c of failedLive) {
      lines.push(`  - ${c.url} (HTTP ${c.status}${c.error ? `: ${c.error}` : ''})`);
    }
  }
  lines.push('', 'This issue will close automatically once all checks pass.');
  return lines.join('\n');
}

async function syncAlertIssue(report) {
  if (!process.env.GITHUB_TOKEN) return;

  const hasFailure =
    !report.profile_check.ok ||
    report.summary.hygiene_passed !== report.summary.total_public_repos ||
    report.summary.live_ok !== report.summary.live_total;

  const issuesApi = `https://api.github.com/repos/${OWNER}/${OWNER}/issues`;
  const openIssues = await fetchJson(`${issuesApi}?state=open&per_page=30`);
  const existing = openIssues.find((i) => !i.pull_request && i.title === ALERT_ISSUE_TITLE);

  if (hasFailure) {
    const body = buildFailureBody(report);
    if (!existing) {
      const res = await fetch(issuesApi, {
        method: 'POST',
        headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ALERT_ISSUE_TITLE, body }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Failed to create alert issue: ${res.status}`);
      console.log('Opened Ecosystem Ops alert issue.');
    } else if (existing.body !== body) {
      const res = await fetch(`${issuesApi}/${existing.number}`, {
        method: 'PATCH',
        headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Failed to update alert issue: ${res.status}`);
      console.log(`Updated Ecosystem Ops alert issue #${existing.number}.`);
    }
  } else if (existing) {
    await fetch(`${issuesApi}/${existing.number}/comments`, {
      method: 'POST',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'All automated Ecosystem Ops checks are now passing. Closing alert automatically.' }),
      signal: AbortSignal.timeout(15000),
    });
    const res = await fetch(`${issuesApi}/${existing.number}`, {
      method: 'PATCH',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'closed' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Failed to close alert issue: ${res.status}`);
    console.log(`Closed resolved Ecosystem Ops alert issue #${existing.number}.`);
  }
}

function writeStepSummary(report, checkedAt) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    `## ${OWNER} Ecosystem Ops Summary`,
    `- Checked at: \`${checkedAt}\``,
    `- Profile check: **${report.profile_check.ok ? 'Pass' : report.profile_check.issues.join(', ')}** (\`${report.profile_check.blog}\`)`,
    `- Public repositories audited: **${report.summary.total_public_repos}**`,
    `- Hygiene & security compliant: **${report.summary.hygiene_passed}/${report.summary.total_public_repos}**`,
    `- Live endpoints healthy: **${report.summary.live_ok}/${report.summary.live_total}**`,
    '',
    '| Repository | Hygiene & Security | Live Endpoint | Status |',
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
  const [profileCheck, repos] = await Promise.all([auditProfile(), fetchPublicRepos()]);

  const liveChecksMap = new Map();
  const urlsToCheck = new Set([PORTFOLIO_URL]);
  for (const repo of repos) {
    const url = liveAppUrl(repo);
    if (url) urlsToCheck.add(url);
  }

  const [checkResults, repoAudits] = await Promise.all([
    Promise.all([...urlsToCheck].map(async (url) => [url, await checkUrl(url)])),
    Promise.all(repos.map((repo) => auditRepo(repo))),
  ]);

  for (const [url, result] of checkResults) {
    liveChecksMap.set(url, result);
  }

  const records = repos.map((repo, idx) => {
    const url = liveAppUrl(repo);
    const { issues, secretFiles } = repoAudits[idx];
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
      hygiene_issues: issues,
      secret_files: secretFiles,
    };
  });

  const liveChecks = [...liveChecksMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  const report = {
    owner: OWNER,
    portfolio_url: PORTFOLIO_URL,
    profile_check: profileCheck,
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
  await syncAlertIssue(report);

  console.log(
    `Profile=${profileCheck.ok ? 'OK' : profileCheck.issues.join(',')}, ` +
      `Audited ${report.summary.total_public_repos} repos (${report.summary.hygiene_passed} hygiene/security pass), ` +
      `${report.summary.live_ok}/${report.summary.live_total} live endpoints OK. ` +
      `Changes: README=${readmeChanged}, health=${healthChanged}`
  );

  const failedLive = liveChecks.filter((c) => !c.ok);
  const failedHygiene = records.filter((r) => r.hygiene_issues.length > 0);
  if (!profileCheck.ok || failedLive.length > 0 || failedHygiene.length > 0) {
    if (failedLive.length > 0) console.error('Unreachable live endpoints:', failedLive);
    if (failedHygiene.length > 0) console.error('Hygiene/security issues:', failedHygiene.map((r) => [r.name, r.hygiene_issues]));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
