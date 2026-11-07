const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID', 'SUPABASE_SERVICE_ROLE_KEY'];
required.push('HUBSPOT_ACCESS_TOKEN');
const missing = required.filter(key => !process.env[key]);
for (const key of required) console.log(`${process.env[key] ? 'OK' : 'FALTA'} ${key}`);
if (process.env.SUPABASE_URL !== process.env.VITE_SUPABASE_URL) {
  console.error('Las URLs de Supabase del navegador y del servidor deben coincidir.');
  process.exit(1);
}
process.exitCode = missing.length ? 1 : 0;
