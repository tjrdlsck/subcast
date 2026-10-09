const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const target = path.resolve(__dirname, '../../test_results/browser/cache/fabric.min.js');
const hash = 'f3a3763020189d69b8d2b64197172682b6d90f8f90fcac52d799b0cf64a9870a';

async function main() {
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js', {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Fabric download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== hash) {
    throw new Error('Fabric 5.3.0 checksum mismatch');
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  console.log('Fabric 5.3.0 test cache prepared and checksum verified.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
