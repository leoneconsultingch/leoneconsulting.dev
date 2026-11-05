import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(repoRoot, 'mcp', 'leone', 'server.mjs');

test('MCP stdio handshake lists and serves only public portfolio tools', async (t) => {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));

  let buffer = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) pending.get(message.id)?.(message);
    }
  });

  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 3000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(message);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  const initialized = await request(1, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'leone-mcp-test', version: '1.0.0' },
  });
  assert.equal(initialized.error, undefined);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  const listed = await request(2, 'tools/list');
  const names = listed.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ['portfolio_get', 'portfolio_list', 'site_info']);
  assert.ok(listed.result.tools.every((tool) => tool.annotations?.readOnlyHint === true));

  const called = await request(3, 'tools/call', {
    name: 'portfolio_list',
    arguments: { language: 'it', limit: 2 },
  });
  assert.equal(called.error, undefined);
  const envelope = JSON.parse(called.result.content[0].text);
  assert.equal(envelope.schema_version, 'leone.mcp.v1');
  assert.ok(envelope.data.items.length > 0);
  assert.ok(envelope.data.items.every((item) => item.url.startsWith('https://leoneconsulting.dev/portfolio/')));

  const draft = await request(4, 'tools/call', {
    name: 'portfolio_get',
    arguments: { language: 'it', slug: 'not-published' },
  });
  assert.equal(draft.result.isError, true);
  assert.deepEqual(JSON.parse(draft.result.content[0].text).error.code, 'NOT_FOUND');
  assert.equal(child.exitCode, null);
});
