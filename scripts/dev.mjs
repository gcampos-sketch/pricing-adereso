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
    if (!(await hub.text()).includes('Hub comercial')) throw new Error('El puerto 8877 está ocupado por otra aplicación.');
    console.log('Usando el Hub comercial que ya está abierto.');
  } else run('python3', ['-m', 'http.server', '8877', '--bind', '127.0.0.1']);
  run('npm', ['--prefix', 'dashboard-sales', 'run', 'dev']);
  console.log('Hub: http://127.0.0.1:8877/?vista=dashboard');
} catch (error) { console.error(error.message); stop(1); }
