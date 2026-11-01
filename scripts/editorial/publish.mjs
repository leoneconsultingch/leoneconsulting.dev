// Deterministic site publisher. Authority is supplied only by the private service outbox.
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync, openSync, closeSync, fstatSync, constants} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validatePost, contentDigest} from '../../src/lib/blog.ts';

const REPO = 'repos/leoneconsultingch/leoneconsulting.dev';
const PROJECT_PATH = '/marios-projects-b9ce4d5f/leoneconsulting-dev/';
function projectStatus(value) {
  return value?.statuses?.find(status => {
    try {const url = new URL(status.target_url); return status.context === 'Vercel'
      && url.protocol === 'https:' && url.hostname === 'vercel.com' && !url.username && !url.password
      && url.pathname.startsWith(PROJECT_PATH); } catch {return false;}
  });
}

export function runtimeAuthority() {
  const fd = openSync(new URL('../../publisher-owner.json', import.meta.url), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== 0 || info.nlink !== 1 || (info.mode & 0o022) || info.size > 1024) throw new Error('Untrusted publisher owner configuration');
    const owner = JSON.parse(readFileSync(fd, 'utf8'));
    if (!Number.isInteger(owner.uid) || owner.uid < 1 || process.getuid() !== owner.uid
        || owner.repository !== 'leoneconsultingch/leoneconsulting.dev' || owner.branch !== 'main') throw new Error('Publisher execution identity not authorized');
  } finally {closeSync(fd);}
}
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
    : JSON.stringify(value);
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

export function prepare(job) {
  if (!job || job.authorization !== 'approve-publish' || !Number.isInteger(job.version)
      || job.version < 1 || !/^[a-f0-9]{64}$/.test(job.id)) throw new Error('Invalid publication authority');
  const post = structuredClone(validatePost(job.post));
  if (post.published || post.approval !== null || post.publishedAt !== null
      || digest(post) !== job.content_digest || job.approval?.digest !== job.content_digest
      || job.approval?.version !== job.version || job.approval?.by !== 'Mario Leone') throw new Error('Approval/content mismatch');
  const expected = createHash('sha256').update(`${job.item_id}:${job.version}:${job.content_digest}`).digest('hex');
  if (job.id !== expected) throw new Error('Publication identity mismatch');
  const date = job.approval.at?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(job.approval.at) || date > new Date().toISOString().slice(0, 10)) throw new Error('Invalid approval date');
  post.published = true;
  post.publishedAt = date;
  post.approval = {by: 'Mario Leone', at: date, digest: contentDigest(post)};
  validatePost(post);
  return {post, path: `company/blog/${post.slug}.json`, document_digest: digest(post),
    urls: {it: `https://leoneconsulting.dev/blog/${post.slug}/`, en: `https://leoneconsulting.dev/en/blog/${post.slug}/`}};
}

export function github(path, {method = 'GET', body} = {}) {
  if (path !== REPO && !path.startsWith(`${REPO}/`)) throw new Error('Repository outside publisher scope');
  if (method !== 'GET') {
    if (method !== 'PUT' || !/^repos\/leoneconsultingch\/leoneconsulting\.dev\/contents\/company\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(path)
        || body?.branch !== 'main') throw new Error('Write outside approved article scope');
    runtimeAuthority();
  }
  return new Promise((resolveResult, reject) => {
    const args = ['api', path, '--method', method];
    if (body !== undefined) args.push('--input', '-');
    const child = spawn('/usr/local/bin/mc-gh', args, {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, GH_HOST: 'github.com'}});
    const chunks = []; let size = 0; let errors = '';
    const timer = setTimeout(() => {child.kill('SIGTERM'); reject(new Error('GitHub timeout'));}, 35000);
    child.stdout.on('data', part => {size += part.length; if (size > 2_000_000) {child.kill('SIGTERM'); reject(new Error('GitHub response exceeds limit'));} else chunks.push(part);});
    child.stderr.on('data', part => {if (errors.length < 4000) errors += part;});
    child.once('error', () => {clearTimeout(timer); reject(new Error('GitHub wrapper unavailable'));});
    child.once('close', code => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (code !== 0) {const error = new Error(/HTTP 404|Not Found/i.test(errors + raw) ? 'GitHub not found' : 'GitHub request refused'); error.notFound = /HTTP 404|Not Found/i.test(errors + raw); reject(error); return;}
      try {resolveResult(JSON.parse(raw));} catch {reject(new Error('Invalid GitHub response'));}
    });
    child.stdin.on('error', () => {});
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function currentFile(path, api) {
  try {
    const file = await api(`${REPO}/contents/${path}?ref=main`);
    if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 256000
        || !/^[a-f0-9]{40}$/.test(file.sha)) throw new Error('Invalid remote article');
    return {sha: file.sha, post: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))};
  } catch (error) {if (error.notFound) return null; throw error;}
}

export async function submit(job, api = github, reconcileOnly = false) {
  const prepared = prepare(job);
  const existing = await currentFile(prepared.path, api);
  if (existing && digest(existing.post) === prepared.document_digest) {
    const commits = await api(`${REPO}/commits?sha=main&path=${encodeURIComponent(prepared.path)}&per_page=1`);
    if (!commits[0]?.sha || !/^[a-f0-9]{40}$/.test(commits[0].sha)) throw new Error('Article commit not found');
    return {...prepared, post: undefined, status: 'submitted', commit_sha: commits[0].sha, reused: true};
  }
  if (reconcileOnly) return {status: existing ? 'conflict' : 'unknown', error: 'Invio non confermato: nessun nuovo commit eseguito.'};
  if (existing && (!job.previous_document_digest || digest(existing.post) !== job.previous_document_digest)) {
    return {status: 'conflict', error: 'Lo slug esiste con contenuto diverso: nessuna sovrascrittura.'};
  }
  await branchRules(api); // Respect protections even when the PAT account is an administrator.
  const body = {branch: 'main', message: `publish(blog): ${prepared.post.slug}\n\nEditorial-Publication: ${job.id}\nApproved-Version: ${job.version}\nAgent-Session: editorial-publisher-${job.id}`,
    content: Buffer.from(JSON.stringify(prepared.post, null, 2) + '\n').toString('base64'),
    ...(existing ? {sha: existing.sha} : {})};
  let result;
  try {result = await api(`${REPO}/contents/${prepared.path}`, {method: 'PUT', body});}
  catch {return {status: 'unknown', error: 'Esito GitHub incerto: riconciliazione senza reinvio.'};}
  if (!/^[a-f0-9]{40}$/.test(result.commit?.sha ?? '')) return {status: 'unknown', error: 'Ricevuta commit non valida: riconciliazione richiesta.'};
  return {...prepared, post: undefined, status: 'submitted', commit_sha: result.commit.sha, reused: false};
}

export async function inspect(job, api = github) {
  if (!/^[a-f0-9]{40}$/.test(job.commit_sha ?? '')) throw new Error('Invalid commit identity');
  const status = projectStatus(await api(`${REPO}/commits/${job.commit_sha}/status`));
  if (!status) return {status: 'verifying', message: 'In attesa della ricevuta del progetto Vercel corretto.'};
  if (['failure', 'error'].includes(status.state)) return {status: 'failed', error: 'Build Vercel del sito non riuscito.'};
  if (status.state !== 'success') return {status: 'verifying', message: 'Build Vercel del sito in corso.'};
  const deployments = await api(`${REPO}/deployments?sha=${job.commit_sha}&environment=Production&per_page=20`);
  if (!Array.isArray(deployments)) throw new Error('Invalid deployment response');
  const match = deployments.filter(d => d.sha === job.commit_sha && d.environment === 'Production' && d.creator?.login === 'vercel[bot]')
    .sort((a,b) => b.id-a.id)[0];
  if (!match) return {status: 'verifying', message: 'In attesa del deployment Vercel di produzione.'};
  if (!Number.isSafeInteger(match.id) || match.id < 1) throw new Error('Invalid deployment identity');
  const statuses = await api(`${REPO}/deployments/${match.id}/statuses`);
  if (!Array.isArray(statuses) || !statuses.length) return {status: 'verifying', message: 'Build di produzione in attesa.'};
  const latest = statuses[0];
  if (['error', 'failure'].includes(latest.state)) return {status: 'failed', error: 'Build o deploy Vercel non riuscito.'};
  const succeeded = statuses.find(status => status.state === 'success');
  if (!succeeded || !['success', 'inactive'].includes(latest.state)) return {status: 'verifying', message: 'Build/deploy Vercel in corso.'};
  const url = new URL(succeeded.environment_url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.username || url.password) throw new Error('Invalid deployment URL');
  return {status: 'deployment-ready', deployment_id: match.id, deployment_url: url.origin};
}

export async function preflight(api = github) {
  const repo = await api(REPO);
  if (repo.default_branch !== 'main' || repo.permissions?.push !== true) throw new Error('GitHub publishing access unavailable');
  await branchRules(api);
  if (!projectStatus(await api(`${REPO}/commits/main/status`))) throw new Error('Pinned Vercel project receipt unavailable');
  return {ready: true};
}

export async function branchRules(api = github) {
  const branch = await api(`${REPO}/branches/main`);
  if (branch.protected === true) {
    const rules = await api(`${REPO}/branches/main/protection`);
    if (rules.required_pull_request_reviews || rules.required_status_checks || rules.restrictions
        || rules.required_signatures?.enabled || rules.lock_branch?.enabled
        || rules.required_deployments?.enabled) throw new Error('Branch requires a separate reviewed workflow; no bypass permitted');
  } else if (branch.protected !== false) throw new Error('Branch protections unavailable');
  const rulesets = await api(`${REPO}/rules/branches/main`);
  if (!Array.isArray(rulesets) || rulesets.some(rule => !['deletion', 'non_fast_forward', 'required_linear_history'].includes(rule.type))) throw new Error('Unsupported branch rules; no bypass permitted');
}

async function main() {
  const command = process.argv[2];
  const job = JSON.parse(readFileSync(0, 'utf8'));
  try {
    const result = command === 'prepare' ? prepare(job)
      : command === 'preflight' ? (runtimeAuthority(), await preflight())
      : command === 'access-check' ? await preflight()
      : command === 'submit' ? await submit(job)
      : command === 'reconcile' ? await submit(job, github, true)
      : command === 'inspect' ? await inspect(job)
      : (() => {throw new Error('Unknown publisher command');})();
    console.log(JSON.stringify(result));
  } catch {console.log(JSON.stringify({status: 'failed', error: 'Pubblicazione non eseguita: controllare accesso, schema o ricevuta.'})); process.exitCode = 1;}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
