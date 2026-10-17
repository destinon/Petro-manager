import fs from 'fs';

const code = fs.readFileSync('src/services/api.js', 'utf8');

// Regex to capture full functions
const funcRegex = /export (?:async )?function ([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?)(?=\nexport |$)/g;
let match;
const results = [];

while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1];
    const body = match[2];
    const hasSupabase = body.includes('supabase.');
    const tables = [...body.matchAll(/supabase\s*\.\s*from\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
    const usesLocalStorage = body.includes('localStorage');
    const hasRpc = body.includes('supabase.rpc');
    const hasAuth = body.includes('supabase.auth');
    results.push({
        name,
        hasSupabase,
        tables: [...new Set(tables)],
        hasRpc,
        hasAuth,
        usesLocalStorage
    });
}

console.log(JSON.stringify(results, null, 2));
