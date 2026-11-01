import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { CODEX_LAUNCHER, codexEnvironment } from './codex.mjs';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const endpoint = 'http://127.0.0.1:18000';
const files = ['scripts/editorial/run.mjs', 'scripts/editorial/codex.mjs', 'scripts/editorial/delivery.mjs', 'scripts/editorial/sources.json',
  'src/lib/blog.ts', 'company/blog/computer-use-pilot.json'];

export function selectEditorialModel(config, requested) {
  const routes = Object.entries(config.providers ?? {}).filter(([id, provider]) => id !== 'ollama' && provider.enabled);
  const available = model => {
    const hits = routes.filter(([, provider]) => provider.models?.includes(model));
    return hits.length === 1 && hits[0][1].credentialAvailable === true;
  };
  const choices = requested ? [requested] : [config.defaultModel, 'glm-5.3'];
  const model = choices.find(value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value) && available(value));
  if (!model) throw new Error('No unique enabled cloud route with an available credential; review the MissionControl model configuration');
  return model;
}

async function metadata(path) {
  const response = await fetch(`${endpoint}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`MissionControl metadata unavailable: HTTP ${response.status}`);
  return response.json();
}

async function checkExisting(path, content) {
  try {
    if (!(await readFile(path)).equals(Buffer.from(content))) throw new Error(`Existing file differs; review before replacing: ${path}`);
    return true;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function installFile(path, content, mode = 0o600) {
  if (await checkExisting(path, content)) return;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { flag: 'wx', mode });
}

export function canUpgradeSetting(previous, next, kind) {
  if (previous === next) return true;
  if (kind === 'service') {
    const normalize = value => value
      .replace('\n# Managed Codex authentication and cache remain owned by its existing account.\nReadWritePaths=%h/.codex\n', '')
      .replace('\n# Filesystem isolation is provided by the managed Codex read-only sandbox.\n', '')
      .replace(/^PrivateTmp=yes\n/m, '').replace(/^ProtectSystem=strict\n/m, '')
      .replace(/^ProtectHome=read-only\n/m, '').replace(/^ReadWritePaths=%h\/\.local\/state\/leone-editorial\n/m, '');
    const oldRevision = previous.match(/^WorkingDirectory=%h\/\.local\/share\/leone-editorial\/releases\/([a-f0-9]{20})$/m)?.[1];
    return Boolean(oldRevision && normalize(previous) === normalize(next).replace(/leone-editorial\/releases\/[a-f0-9]{20}/, `leone-editorial/releases/${oldRevision}`));
  }
  if (kind === 'runtime') {
    const codex = /^\[Service\]\nEnvironment=EDITORIAL_BACKEND=codex\nEnvironment=EDITORIAL_MODEL=gpt-[A-Za-z0-9._-]{1,100}\n$/;
    const pattern = /^\[Service\]\n(?:Environment=EDITORIAL_BACKEND=gateway\n)?Environment=MISSIONCONTROL_GATEWAY_SOCKET=(\/[A-Za-z0-9/._-]+)\nEnvironment=EDITORIAL_MODEL=([A-Za-z0-9][A-Za-z0-9._:/-]{0,127})\n$/;
    if (codex.test(previous) && codex.test(next)) return true;
    if ((codex.test(previous) && pattern.test(next)) || (pattern.test(previous) && codex.test(next))) return true;
    const oldConfig = previous.match(pattern); const newConfig = next.match(pattern);
    return Boolean(oldConfig && newConfig && oldConfig[1] === newConfig[1]);
  }
  return false;
}

export function editorialService(template, backend, revision) {
  let service = template.replace('leone-editorial/app', `leone-editorial/releases/${revision}`);
  if (backend === 'codex') {
    // User-service mount namespaces remap the registry's root owner and make
    // the canonical managed launcher refuse it. Keep its guard intact and use
    // Codex's read-only sandbox instead of changing registry permissions.
    service = service.replace(/^PrivateTmp=yes\n/m, '').replace(/^ProtectSystem=strict\n/m, '')
      .replace(/^ProtectHome=read-only\n/m, '').replace(/^ReadWritePaths=.*\n/m, '')
      + '\n# Filesystem isolation is provided by the managed Codex read-only sandbox.\n';
  }
  return service;
}

export async function activate({ checkOnly = false, requestedModel, upgrade = false, backend = 'codex' } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node >=24 required');
  if (!['codex', 'gateway'].includes(backend)) throw new Error('Unsupported editorial backend');
  const uid = process.getuid();
  let gateway; let model; let authorized;
  if (backend === 'codex') {
    model = requestedModel || 'gpt-6.1-terra';
    if (!/^gpt-[A-Za-z0-9._-]{1,100}$/.test(model)) throw new Error('Invalid Codex model');
    try {
      await execute('/usr/bin/python3', [CODEX_LAUNCHER, 'codex', '--version'], { cwd: '/tmp', env: codexEnvironment(), timeout: 20000 });
      const login = await execute('/usr/bin/python3', [CODEX_LAUNCHER, 'codex', 'login', 'status'], { cwd: '/tmp', env: codexEnvironment(), timeout: 20000 });
      authorized = /Logged in/i.test(login.stdout + login.stderr);
    } catch { authorized = false; }
  } else {
    const [hub, config] = await Promise.all([metadata('/api/hubai/status'), metadata('/api/ai-router')]);
    gateway = hub.gateway;
    if (!gateway?.running || !/^\/[A-Za-z0-9/._-]+$/.test(gateway.socket_path ?? '')) throw new Error('MissionControl gateway is not running with a valid socket');
    model = selectEditorialModel(config, requestedModel);
    authorized = gateway.allowed_consumers?.some(consumer => String(consumer.uid) === String(uid)) === true;
  }
  const report = { backend, authorized, model, schedule: 'Monday 09:00 Europe/Rome, up to 15 minutes jitter' };
  if (checkOnly) return { status: authorized ? 'preflight-ready' : 'account-not-authorized', ...report };
  if (!authorized) throw new Error(`Run this command from the managed ${backend === 'codex' ? 'Codex account with an existing login' : 'MissionControl gateway account'}; no permissions were changed`);
  if (gateway && !(await stat(gateway.socket_path)).isSocket()) throw new Error('Configured gateway socket is unavailable');

  const env = { ...process.env, XDG_RUNTIME_DIR: `/run/user/${uid}`, DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${uid}/bus` };
  const systemctl = async (...args) => (await execute('/usr/bin/systemctl', ['--user', ...args], { env, timeout: 500000, maxBuffer: 100000 })).stdout.trim();
  if (await systemctl('show', 'default.target', '--property=ActiveState', '--value') !== 'active') throw new Error('The authorized account user manager is not active');

  const payloads = await Promise.all(files.map(async file => [file, await readFile(join(root, file))]));
  const hash = createHash('sha256');
  for (const [file, content] of payloads) hash.update(file).update(content);
  const revision = hash.digest('hex').slice(0, 20);
  const app = join(homedir(), '.local/share/leone-editorial/releases', revision);
  const state = join(homedir(), '.local/state/leone-editorial');
  const units = join(homedir(), '.config/systemd/user');
  const service = editorialService(await readFile(join(root, 'ops/editorial/mc-ai-editorial.service'), 'utf8'), backend, revision);
  const timer = await readFile(join(root, 'ops/editorial/mc-ai-editorial.timer'));
  const runtime = backend === 'codex'
    ? `[Service]\nEnvironment=EDITORIAL_BACKEND=codex\nEnvironment=EDITORIAL_MODEL=${model}\n`
    : `[Service]\nEnvironment=EDITORIAL_BACKEND=gateway\nEnvironment=MISSIONCONTROL_GATEWAY_SOCKET=${gateway.socket_path}\nEnvironment=EDITORIAL_MODEL=${model}\n`;
  const settings = [[join(units, 'mc-ai-editorial.service'), service, 'service'],
    [join(units, 'mc-ai-editorial.timer'), timer, 'timer'],
    [join(units, 'mc-ai-editorial.service.d/runtime.conf'), runtime, 'runtime']];
  // Refuse concurrent or hand-written configuration before installing anything.
  const replacements = [];
  for (const [path, content, kind] of settings) {
    try { await checkExisting(path, content); }
    catch (error) {
      if (!upgrade) throw error;
      const previous = await readFile(path, 'utf8');
      if (!canUpgradeSetting(previous, Buffer.from(content).toString('utf8'), kind)) throw new Error(`Unrecognized configuration; upgrade refused: ${path}`);
      replacements.push({ path, content, previous });
    }
  }
  const readState = async unit => {
    try { return await systemctl('is-active', unit); }
    catch (error) {
      const value = String(error.stdout ?? '').trim();
      if (['inactive', 'failed', 'unknown'].includes(value)) return value;
      throw error;
    }
  };
  const serviceState = await readState('mc-ai-editorial.service');
  const timerState = await readState('mc-ai-editorial.timer');
  if (['active', 'activating', 'deactivating', 'reloading'].includes(serviceState)
    || ['active', 'activating'].includes(timerState)) throw new Error('Editorial service or timer is already running; stop it before installing an update');
  for (const [file, content] of payloads) await checkExisting(join(app, file), content);
  await mkdir(state, { recursive: true, mode: 0o700 });
  if ((await stat(state)).mode & 0o077) throw new Error('Editorial state directory must be private (0700)');
  for (const [file, content] of payloads) await installFile(join(app, file), content, 0o400);
  const backupDir = join(state, 'activation-backups', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  for (const replacement of replacements) {
    await checkExisting(replacement.path, replacement.previous);
    await installFile(join(backupDir, basename(replacement.path)), replacement.previous);
    const temporary = `${replacement.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, replacement.content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, replacement.path);
  }
  for (const [path, content] of settings) await installFile(path, content);
  await execute('/usr/bin/systemd-analyze', ['--user', 'verify', join(units, 'mc-ai-editorial.service'), join(units, 'mc-ai-editorial.timer')], { env, timeout: 30000 });
  await systemctl('daemon-reload');
  // One real run must succeed before recurring execution can be enabled.
  console.log('Running the first editorial review; the timer is not enabled yet.');
  try { await systemctl('start', 'mc-ai-editorial.service'); }
  catch {
    const diagnostic = await execute('/usr/bin/journalctl', ['--user', '-u', 'mc-ai-editorial.service', '-n', '30', '--no-pager', '-o', 'cat'], { env, timeout: 10000 })
      .then(result => result.stdout.split('\n').filter(line => line.startsWith('Editorial: ')).slice(-1)[0] ?? '')
      .catch(() => '');
    throw new Error(diagnostic || 'First editorial run failed; inspect its journal. Timer was not enabled');
  }
  const result = await systemctl('show', 'mc-ai-editorial.service', '--property=Result', '--value');
  if (result !== 'success') throw new Error('First editorial run failed; timer remains disabled');
  await systemctl('enable', '--now', 'mc-ai-editorial.timer');
  if (await systemctl('is-active', 'mc-ai-editorial.timer') !== 'active'
    || await systemctl('is-enabled', 'mc-ai-editorial.timer') !== 'enabled') throw new Error('Timer activation could not be verified');
  const nextRun = await systemctl('show', 'mc-ai-editorial.timer', '--property=NextElapseUSecRealtime', '--value');
  const receipt = { status: 'active', ...report, revision, nextRun, activatedAt: new Date().toISOString() };
  await writeFile(join(state, 'activation.json'), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const modelIndex = args.indexOf('--model');
  const backendIndex = args.indexOf('--backend');
  if (args.some((arg, index) => !['--check', '--model', '--upgrade', '--backend'].includes(arg)
    && !(modelIndex >= 0 && index === modelIndex + 1) && !(backendIndex >= 0 && index === backendIndex + 1))
    || (modelIndex >= 0 && !args[modelIndex + 1]) || (backendIndex >= 0 && !args[backendIndex + 1])) {
    console.error('Usage: activate.mjs [--check] [--upgrade] [--backend codex|gateway] [--model <model>]'); process.exitCode = 1;
  } else {
    activate({ checkOnly: args.includes('--check'), requestedModel: modelIndex >= 0 ? args[modelIndex + 1] : undefined,
      upgrade: args.includes('--upgrade'), backend: backendIndex >= 0 ? args[backendIndex + 1] : 'codex' })
      .then(report => { console.log(JSON.stringify(report)); if (!report.authorized) process.exitCode = 2; })
      .catch(error => {
        const reason = error instanceof Error ? error.message.split('\n')[0].slice(0, 400) : 'Unknown error';
        console.error(`Editorial activation failed: ${reason}`);
        console.error('For service failures: journalctl --user -u mc-ai-editorial.service. Timer activation requires a successful first run.');
        process.exitCode = 1;
      });
  }
}
