// Escolhe de onde vêm os dados: Supabase (quando configurado) ou modo demonstração.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const usaSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const db = (await import(usaSupabase ? './db-supabase.js' : './db-demo.js')).default;
export default db;
