// Escolhe de onde vêm os dados: Supabase (quando configurado) ou modo demonstração.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ?demo no endereço (ou já escolhido nesta aba) força o modo demonstração, para testar sem mexer no banco real
let demo = false;
try { if (/[?&]demo\b/.test(location.search)) sessionStorage.setItem('contabil_demo', '1'); demo = sessionStorage.getItem('contabil_demo') === '1'; } catch (e) { /* ok */ }
const usaSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY) && !demo;
const db = (await import(usaSupabase ? './db-supabase.js' : './db-demo.js')).default;
export default db;
