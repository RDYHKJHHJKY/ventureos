const fs = require('fs');
const path = require('path');
const tempDir = process.env.TEMP || process.env.TMP || path.join(process.env.LOCALAPPDATA || '', 'Temp');
console.log('Temp directory:', tempDir);
function safeStat(filePath) {
  try { return fs.statSync(filePath); } catch (error) { return null; }
}
function sizeRecursive(dirPath) {
  const stat = safeStat(dirPath);
  if (!stat) return 0;
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    total += sizeRecursive(path.join(dirPath, entry.name));
  }
  return total;
}
function listEntries() {
  const entries = fs.readdirSync(tempDir, { withFileTypes: true });
  const items = entries.map((entry) => {
    const fullPath = path.join(tempDir, entry.name);
    const size = entry.isDirectory() ? sizeRecursive(fullPath) : safeStat(fullPath)?.size || 0;
    return { name: entry.name, path: fullPath, isDirectory: entry.isDirectory(), size };
  });
  return items.sort((a, b) => b.size - a.size);
}
function formatSize(size) {
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
const items = listEntries();
console.log('Top 30 temp items:');
for (const item of items.slice(0, 30)) {
  console.log(formatSize(item.size), item.isDirectory ? 'DIR ' : 'FILE', item.name);
}
const candidates = items.filter((item) => {
  const name = item.name.toLowerCase();
  return name.startsWith('postgresql_installer') || name.startsWith('vscode-insider-user-x64') || name.startsWith('brl00000') || name.includes('codesetup-insider') || name.includes('setup log') || name.includes('vcredist') || name.includes('postgresql.postgresql');
});
console.log('\nCandidates for removal:');
for (const item of candidates) {
  console.log(formatSize(item.size), item.isDirectory ? 'DIR ' : 'FILE', item.path);
}
console.log('\nAttempting cleanup on candidates...');
for (const item of candidates) {
  try {
    if (item.isDirectory) {
      fs.rmSync(item.path, { recursive: true, force: true });
    } else {
      fs.rmSync(item.path, { force: true });
    }
    console.log('Removed', item.path);
  } catch (error) {
    console.error('Failed to remove', item.path, error.message);
  }
}
console.log('\nCleanup complete.');
