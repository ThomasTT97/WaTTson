import fs from 'fs';
const file = fs.readFileSync('services/geminiService.ts', 'utf8');
console.log(file.includes('const result = safeParseJSON(response.text);'));
