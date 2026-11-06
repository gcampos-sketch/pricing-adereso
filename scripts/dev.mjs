import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
  process.exitCode = code;
}
function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', detached: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
try {
  let hub;
  try { hub = await fetch('http://127.0.0.1:8877/', { signal: AbortSignal.timeout(2000) }); }
  catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw error; }
  if (hub) {
    const probe = await fetch('http://127.0.0.1:8877/hub-content/index.html');
    if (probe.status !== 401 || (await probe.json()).error !== 'authentication_required') throw new Error('El puerto 8877 tiene un servidor anterior. Detén ese proceso antes de iniciar el Hub protegido.');
    console.log('Usando el Hub comercial que ya está abierto.');
  } else run('node', ['scripts/hub-dev-server.mjs']);
  let app;
  try { app = await fetch('http://127.0.0.1:8878/hub-content/index.html', { signal: AbortSignal.timeout(2000) }); } catch {}
  if (app?.status !== 401) run('npm', ['--prefix', 'dashboard-sales', 'run', 'dev']);
  else console.log('Usando la aplicación autenticada que ya está abierta.');
  console.log('Hub: http://127.0.0.1:8877/');
} catch (error) { console.error(error.message); stop(1); }
