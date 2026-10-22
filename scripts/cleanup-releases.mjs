import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const OWNER = 'urnova';
const REPO = 'Astral-Security-Guard-vpn';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Node-Release-Script',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log(`[Cleanup] Fetching all releases for ${OWNER}/${REPO}...`);
  const releases = await request(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=100`);
  console.log(`[Cleanup] Found ${releases.length} releases.`);

  for (const rel of releases) {
    console.log(`[Cleanup] Deleting release ID ${rel.id} (tag: ${rel.tag_name}, name: "${rel.name}")...`);
    try {
      await request(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${rel.id}`, { method: 'DELETE' });
      console.log(`[Cleanup] ✅ Deleted release ${rel.id}`);
    } catch (err) {
      console.error(`[Cleanup] Failed to delete release ${rel.id}:`, err.message);
    }
  }

  console.log(`[Cleanup] Fetching all tags for ${OWNER}/${REPO}...`);
  const tags = await request(`https://api.github.com/repos/${OWNER}/${REPO}/tags?per_page=100`);
  console.log(`[Cleanup] Found ${tags.length} tags.`);

  for (const tag of tags) {
    console.log(`[Cleanup] Deleting tag ref: refs/tags/${tag.name}...`);
    try {
      await request(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/tags/${tag.name}`, { method: 'DELETE' });
      console.log(`[Cleanup] ✅ Deleted tag ${tag.name}`);
    } catch (err) {
      console.error(`[Cleanup] Failed to delete tag ${tag.name}:`, err.message);
    }
  }

  console.log(`[Cleanup] All previous releases and tags have been deleted!`);
}

main().catch(err => {
  console.error('[Cleanup Error]', err);
  process.exit(1);
});
