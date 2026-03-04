const fs = require('fs');
const content = fs.readFileSync('backend/db/schema.js', 'utf8');
const lines = content.split('\n');

function findExportBlocks(lines) {
    const blocks = [];
/**
 * fix_schema_dupes.js
 *  
 * Removes duplicate export declarations from schema.js.
 * For each set of duplicates, we keep the LAST occurrence (which tends to be
 * the most complete definition added by the latest feature branch).
 * 
 * For recurring tables (like auditLogs at line 122 vs 3636): the one at line 122
 * has extra fields (entryHash, etc.) for RBAC system while the one at 3636 is the
 * older audit system. Since both are named 'auditLogs', we need to keep only one.
 * We keep the FIRST one (line 122) as it's the more featureful centralized one, 
 * and remove the second duplicate.
 * 
 * For relations: keep the SECOND (more complete) occurrence.
 */
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../backend/db/schema.js');
const content = fs.readFileSync(schemaPath, 'utf8');
const lines = content.split('\n');

// First pass: identify all exports and their start lines  
const exportMap = {}; // name -> [{ startLine, endLine }]

// Second pass: identify duplicate block ranges to remove
// A block starts with "export const X = ..." and ends at the next "export const " at same indentation level

// We'll find block boundaries
function findExportBlocks(lines) {
    const blocks = []; // { name, start, end }
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].match(/^export const ([a-zA-Z0-9_]+)\s*=/);
        if (m) {
            const name = m[1];
            const start = i;
            let end = i;
            let j = i + 1;
            let depth = 0;
            // Find end of this block: next line that starts a new top-level export/import/comment section
            let end = i;
            let j = i + 1;
            let depth = 0; // Track bracket depth
            // Count opening brackets on the first line
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
            // Include trailing semicolon line if next line is blank or ;
            if (end + 1 < lines.length && lines[end + 1].trim() === ';') {
                end++;
            }
            // Include trailing blank lines
            while (end + 1 < lines.length && lines[end + 1].trim() === '') {
                end++;
            }
            blocks.push({ name, start, end });
            i = end + 1;
        } else {
            i++;
        }
    }
    return blocks;
}

const blocks = findExportBlocks(lines);

// Group by name
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
// Find duplicates
const dupes = Object.entries(byName).filter(([k, v]) => v.length > 1);
console.log('Duplicate exports found:');
dupes.forEach(([name, blocks]) => {
    console.log(`  ${name}: lines ${blocks.map(b => b.start + 1).join(', ')}`);
});

// Determine which blocks to REMOVE
// Strategy:
// For auditLogs (table): keep first (line 122 - more featureful)
// For relations (usersRelations, categoriesRelations, expensesRelations, goalsRelations, 
//   budgetAlertsRelations, washSaleLogsRelations, harvestOpportunitiesRelations): keep last (more complete)
// For recurringTransactions (table): keep last (more fields with indexes)
// For auditAnchors (table): keep last
const linesToRemove = new Set();

for (const [name, blockList] of dupes) {
    if (name === 'auditLogs') {
        // Keep first (line 122), remove second (line 3636+)
        const toRemove = blockList.slice(1);
        toRemove.forEach(b => {
            for (let i = b.start; i <= b.end; i++) {
                linesToRemove.add(i);
            }
            // Also remove a preceding blank line if any
            if (b.start > 0 && lines[b.start - 1].trim() === '') {
                linesToRemove.add(b.start - 1);
            }
        });
    } else {
        // Keep last, remove all earlier ones
        const toRemove = blockList.slice(0, -1);
        toRemove.forEach(b => {
            for (let i = b.start; i <= b.end; i++) {
                linesToRemove.add(i);
            }
            // Also remove preceding comment lines if any
            let commentLine = b.start - 1;
            while (commentLine >= 0 && (lines[commentLine].trim().startsWith('//') || lines[commentLine].trim() === '')) {
                linesToRemove.add(commentLine);
                if (lines[commentLine].trim() === '') break; // stop at blank line
                commentLine--;
            }
        });
    }
}

// Rebuild the file without removed lines
const newLines = lines.filter((_, i) => !linesToRemove.has(i));

console.log(`\nRemoved ${linesToRemove.size} lines`);
console.log(`Original: ${lines.length} lines`);
console.log(`New: ${newLines.length} lines`);

// Write backup
fs.writeFileSync(schemaPath + '.bak', content, 'utf8');

// Write fixed file
fs.writeFileSync(schemaPath, newLines.join('\n'), 'utf8');
console.log('\nSchema fixed! Backup saved as schema.js.bak');
