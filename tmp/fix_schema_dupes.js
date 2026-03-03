const fs = require('fs');
const content = fs.readFileSync('backend/db/schema.js', 'utf8');
const lines = content.split('\n');

function findExportBlocks(lines) {
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].match(/^export const ([a-zA-Z0-9_]+)\s*=/);
        if (m) {
            const name = m[1];
            const start = i;
            let end = i;
            let j = i + 1;
            let depth = 0;
            for (const ch of lines[i]) {
                if (ch === '(' || ch === '{' || ch === '[') depth++;
                else if (ch === ')' || ch === '}' || ch === ']') depth--;
            }
            while (j < lines.length) {
                for (const ch of lines[j]) {
                    if (ch === '(' || ch === '{' || ch === '[') depth++;
                    else if (ch === ')' || ch === '}' || ch === ']') depth--;
                }
                end = j;
                if (depth <= 0) break;
                j++;
            }
            if (end + 1 < lines.length && lines[end + 1].trim() === ';') end++;
            while (end + 1 < lines.length && lines[end + 1].trim() === '') end++;
            blocks.push({ name, start, end });
            i = end + 1;
        } else {
            i++;
        }
    }
    return blocks;
}

const blocks = findExportBlocks(lines);
const byName = {};
for (const block of blocks) {
    if (!byName[block.name]) byName[block.name] = [];
    byName[block.name].push(block);
}

const linesToRemove = new Set();
for (const [name, blockList] of Object.entries(byName)) {
    if (blockList.length > 1) {
        console.log(`Duplicate: ${name} (${blockList.length} occurrences)`);
        // Special case for auditLogs: keep first (line 122) as it was the one with more fields in previous analysis
        // For others, keep last
        if (name === 'auditLogs') {
            blockList.slice(1).forEach(b => {
                for (let k = b.start; k <= b.end; k++) linesToRemove.add(k);
            });
        } else {
            blockList.slice(0, -1).forEach(b => {
                for (let k = b.start; k <= b.end; k++) linesToRemove.add(k);
            });
        }
    }
}

const newLines = lines.filter((_, i) => !linesToRemove.has(i));
fs.writeFileSync('backend/db/schema.js', newLines.join('\n'));
console.log(`Cleaned schema.js. Original: ${lines.length}, New: ${newLines.length}`);
