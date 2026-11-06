#!/usr/bin/env node
// Defaults to a local deployment plan. --apply requires existing, provisioned GCP resources.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = join(root, 'dashboard-sales');
const apply = process.argv.includes('--apply');
const cli = process.env.GCLOUD_BIN || 'gcloud';
const project = 'adereso-internal-tools';
const region = 'us-central1';
const service = 'sales-dashboard';
const repository = process.env.DASHBOARD_ARTIFACT_REPOSITORY || 'commercial-hub';
const runtimeAccount = process.env.DASHBOARD_RUNTIME_SERVICE_ACCOUNT || `sales-dashboard-runtime@${project}.iam.gserviceaccount.com`;
const buildAccount = process.env.DASHBOARD_BUILD_SERVICE_ACCOUNT || `sales-dashboard-build@${project}.iam.gserviceaccount.com`;
const hubspotSecret = process.env.DASHBOARD_HUBSPOT_SECRET || 'sales-dashboard-hubspot-token';
const supabaseSecret = process.env.DASHBOARD_SUPABASE_SECRET || 'sales-dashboard-supabase-service-role';
const hubspotVersion = process.env.DASHBOARD_HUBSPOT_SECRET_VERSION || '1';
const supabaseVersion = process.env.DASHBOARD_SUPABASE_SECRET_VERSION || '1';
const publicKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID'];
const missing = publicKeys.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Falta configuración pública: ${missing.join(', ')}. Ejecuta con --env-file-if-exists=dashboard-sales/.env --env-file-if-exists=dashboard-sales/.env.local.`);
if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(process.env.VITE_SUPABASE_URL)) throw new Error('La URL de Supabase no es válida.');
for (const value of [repository, hubspotSecret, supabaseSecret]) if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Identificador GCP inválido.');
for (const value of [hubspotVersion, supabaseVersion]) if (!/^[1-9]\d*$/.test(value)) throw new Error('Fija una versión numérica de cada secreto.');
for (const account of [runtimeAccount, buildAccount]) if (!account.endsWith(`@${project}.iam.gserviceaccount.com`)) throw new Error('Las cuentas deben pertenecer al proyecto de herramientas internas.');
const sha = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
if (!sha) throw new Error('No se pudo identificar el commit.');
const image = `${region}-docker.pkg.dev/${project}/${repository}/${service}:${sha}`;
console.log(JSON.stringify({ mode: apply ? 'deploy' : 'plan', project, region, service, image, runtimeAccount, buildAccount,
  secrets: { HUBSPOT_ACCESS_TOKEN: `${hubspotSecret}:${hubspotVersion}`, SUPABASE_SERVICE_ROLE_KEY: `${supabaseSecret}:${supabaseVersion}` },
  limits: { cpu: 1, memory: '1Gi', minInstances: 0, maxInstances: 2, concurrency: 20, timeoutSeconds: 300 },
  authentication: 'Supabase Google @adere.so + server MFA; HTTPS service is reachable for sign-in',
}, null, 2));
if (!apply) process.exit(0);
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
if (dirty.status !== 0 || dirty.stdout.trim()) throw new Error('Guarda los cambios en un commit antes de desplegar.');
function cloud(args, capture = false) {
  const result = spawnSync(cli, [...args, '--project', project, '--quiet'], {
    cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error(`No se completó gcloud ${args.slice(0, 3).join(' ')}. Revisa autenticación y permisos; no se modifican IAM ni APIs automáticamente.`);
  return result.stdout?.trim();
}
// These resources must already be authorized/provisioned. Never grant broad permissions in a deployment script.
cloud(['projects', 'describe', project]);
cloud(['artifacts', 'repositories', 'describe', repository, '--location', region]);
for (const account of [runtimeAccount, buildAccount]) cloud(['iam', 'service-accounts', 'describe', account]);
for (const [secret, version] of [[hubspotSecret, hubspotVersion], [supabaseSecret, supabaseVersion]]) {
  const metadata = JSON.parse(cloud(['secrets', 'versions', 'describe', version, '--secret', secret, '--format=json'], true));
  if (metadata.state !== 'ENABLED') throw new Error(`La versión configurada de ${secret} no está habilitada.`);
}
const existing = JSON.parse(cloud(['run', 'services', 'list', '--region', region, `--filter=metadata.name=${service}`, '--format=json'], true));
if (existing.some(item => item.metadata?.labels?.['managed-by'] !== 'hub-comercial')) throw new Error('Ya existe un servicio con ese nombre fuera de este despliegue.');
const dir = mkdtempSync(join(tmpdir(), 'dashboard-cloudbuild-'));
try {
  const build = { steps: [{ name: 'gcr.io/cloud-builders/docker', args: ['build', '-t', image,
    ...publicKeys.flatMap(key => ['--build-arg', `${key}=${process.env[key]}`]), '.'] }], images: [image],
    options: { logging: 'CLOUD_LOGGING_ONLY' }, timeout: '1200s' };
  const config = join(dir, 'cloudbuild.json');writeFileSync(config, JSON.stringify(build));
  cloud(['builds', 'submit', app, '--config', config, '--service-account', `projects/${project}/serviceAccounts/${buildAccount}`]);
  const env = `^|^SUPABASE_URL=${process.env.VITE_SUPABASE_URL}|SUPABASE_PUBLISHABLE_KEY=${process.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  cloud(['run', 'deploy', service, '--image', image, '--region', region, '--service-account', runtimeAccount,
    '--cpu=1', '--memory=1Gi', '--min-instances=0', '--max-instances=2', '--concurrency=20', '--timeout=300', '--port=8080',
    '--cpu-throttling', '--allow-unauthenticated', '--labels=managed-by=hub-comercial', '--set-env-vars', env,
    '--set-secrets', `HUBSPOT_ACCESS_TOKEN=${hubspotSecret}:${hubspotVersion},SUPABASE_SERVICE_ROLE_KEY=${supabaseSecret}:${supabaseVersion}`,
    '--startup-probe=httpGet.path=/healthz,httpGet.port=8080,periodSeconds=5,failureThreshold=12,timeoutSeconds=2']);
  const url = cloud(['run', 'services', 'describe', service, '--region', region, '--format=value(status.url)'], true);
  const health = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(15000) });
  if (!health.ok || (await health.json()).status !== 'ready') throw new Error('La revisión publicada no pasó la comprobación de disponibilidad. No se cambia el destino del hub.');
  console.log(`Servidor disponible: ${url}`);
  console.log('Antes de conectar el hub: autoriza este origen en Supabase y verifica ingreso Google, MFA y un reporte real.');
} finally { rmSync(dir, { recursive: true, force: true }); }
