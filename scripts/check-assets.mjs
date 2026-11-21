import fs from 'node:fs';
import path from 'node:path';

const limit = 25 * 1024 * 1024;
const directory = process.argv[2] ?? 'public';
const files = [];
function inspect(root) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const filename = path.join(root, entry.name);
        if (entry.isDirectory()) inspect(filename);
        else if (entry.isFile()) files.push({ filename, bytes: fs.statSync(filename).size });
    }
}
inspect(directory);
const oversized = files.filter(file => file.bytes > limit);
if (oversized.length) {
    console.error('Cloudflare assets must be at most 25 MiB per file:');
    for (const file of oversized) console.error(`  ${file.filename}: ${(file.bytes / 1048576).toFixed(2)} MiB`);
    process.exitCode = 1;
} else {
    const largest = files.reduce((a, b) => a.bytes > b.bytes ? a : b, { bytes: 0, filename: '(empty)' });
    console.log(`Checked ${files.length} files in ${directory}; all fit Cloudflare's 25 MiB limit. Largest: ${largest.filename} (${(largest.bytes / 1048576).toFixed(2)} MiB).`);
}
