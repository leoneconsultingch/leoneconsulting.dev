import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export const CODEX_LAUNCHER = '/usr/local/libexec/mc-agent-workspace.py';

export function codexArguments(model, directory) {
  if (!/^gpt-[A-Za-z0-9._-]{1,100}$/.test(model)) throw new Error('Invalid Codex model');
  return [CODEX_LAUNCHER, 'codex', 'exec', '--ignore-user-config', '--ephemeral',
    '--sandbox', 'read-only', '--skip-git-repo-check', '--json', '--model', model,
    '--cd', directory, '-c', 'approval_policy="never"', '-c', 'web_search="disabled"',
    '-c', 'project_doc_max_bytes=0', '-c', 'model_reasoning_effort="medium"',
    '-c', 'suppress_unstable_features_warning=true',
    '--disable', 'shell_tool', '--disable', 'computer_use', '--disable', 'view_image',
    '--disable', 'image_generation', '--disable', 'plugins', '--disable', 'remote_plugin',
    '--disable', 'multi_agent', '--disable', 'multi_agent_v2', '--disable', 'skill_search',
    '--disable', 'skill_mcp_dependency_install', '--enable', 'skip_host_skill_discovery', '-'];
}

export function codexEnvironment(environment = process.env) {
  const allowed = ['HOME', 'PATH', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'XDG_CACHE_HOME', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
  return Object.fromEntries([...allowed.filter(key => environment[key] !== undefined).map(key => [key, environment[key]]), ['NO_COLOR', '1']]);
}

export function codexComplete(model, messages, directory, launch = spawn) {
  return new Promise((resolve, reject) => {
    const child = launch('/usr/bin/python3', codexArguments(model, directory), {
      cwd: directory, env: codexEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], detached: true,
    });
    let bytes = 0; let buffer = ''; let answer = ''; let finished = false;
    const decoder = new StringDecoder('utf8');
    const stop = () => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    };
    const fail = error => {
      if (finished) return;
      finished = true; clearTimeout(timer); stop(); reject(error);
    };
    const timer = setTimeout(() => fail(new Error('Codex editorial request timed out')), 240000);
    const consume = line => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { fail(new Error('Codex returned an invalid event')); return; }
      if (event.type === 'error' || event.type === 'turn.failed') {
        fail(new Error('Codex inference failed; check the managed account login and usage limits')); return;
      }
      if (event.type === 'item.started' || event.type === 'item.completed') {
        const type = event.item?.type;
        // CLI diagnostics can be non-fatal (e.g. feature warnings). Only a
        // successful exit with a final answer can complete the request.
        if (type === 'error') return;
        if (!['reasoning', 'agent_message'].includes(type)) {
          const label = typeof type === 'string' && /^[a-z_]{1,50}$/.test(type) ? type : 'unknown';
          fail(new Error(`Codex emitted unsupported item type ${label}; editorial execution stopped`)); return;
        }
        if (event.type === 'item.completed' && type === 'agent_message' && typeof event.item.text === 'string') answer = event.item.text;
      }
    };
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 1000000) return fail(new Error('Codex output exceeds editorial limit'));
      buffer += decoder.write(chunk);
      let end;
      while ((end = buffer.indexOf('\n')) >= 0 && !finished) {
        consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      }
    });
    // Do not forward raw stderr: it may contain account or provider details.
    child.stderr.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 1000000) fail(new Error('Codex output exceeds editorial limit'));
    });
    child.once('error', () => fail(new Error('Managed Codex launcher unavailable')));
    child.stdin.on('error', () => {});
    child.once('close', code => {
      if (finished) return;
      buffer += decoder.end(); consume(buffer);
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (code !== 0 || !answer.trim()) reject(new Error('Codex produced no editorial answer; verify managed login and model availability'));
      else resolve(answer);
    });
    child.stdin.end(JSON.stringify({ instruction: 'Return only the requested editorial JSON. Do not use tools or inspect files.', messages }));
  });
}
