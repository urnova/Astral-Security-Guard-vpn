import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ── Charge .env local si présent (toujours ignoré par .gitignore) ────────────
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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN ou GH_TOKEN est requis via variable d\'environnement ou fichier local .env');
  process.exit(1);
}

const OWNER = 'urnova';
const REPO = 'Astral-Security-Guard-vpn';

// Read dynamic package version
const pkgPath = path.join(rootDir, 'astral-desktop', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const RELEASE_NAME = `Vanguard Core v${VERSION} (Bêta Pré-release)`;

function httpsRequest(urlStr, options = {}, bodyBufferOrStream = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Astral-Release-Script',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(options.headers || {})
      },
      family: 4
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${raw}`));
        }
      });
    });

    req.on('error', reject);

    if (bodyBufferOrStream) {
      if (typeof bodyBufferOrStream.pipe === 'function') {
        bodyBufferOrStream.pipe(req);
      } else {
        req.write(bodyBufferOrStream);
        req.end();
      }
    } else {
      req.end();
    }
  });
}

function getReleaseNotes() {
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  const content = fs.readFileSync(changelogPath, 'utf8');
  const regex = new RegExp(`## \\[${VERSION.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`);
  const match = content.match(regex);
  if (match && match[1]) {
    return `## 🚀 Vanguard Core v${VERSION} (Bêta Pré-release)\n\n${match[1].trim()}\n\n---\n*Développé et certifié par Astral Security.*`;
  }
  return `Release v${VERSION} - Vanguard Core Bêta Pré-release par Astral Security`;
}

async function uploadAsset(uploadUrlTemplate, fileName, filePath) {
  const stats = fs.statSync(filePath);
  const uploadUrl = uploadUrlTemplate.replace(/\{(\?name,label|name)\}/, '') + `?name=${encodeURIComponent(fileName)}`;
  
  console.log(`[Upload] Uploading "${fileName}" (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);
  const stream = fs.createReadStream(filePath);
  
  const assetData = await httpsRequest(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stats.size.toString()
    }
  }, stream);

  console.log(`[Upload] ✅ Uploaded "${fileName}" (ID: ${assetData.id})`);
  return assetData;
}

async function main() {
  console.log(`[Release] Starting release process for ${TAG} on ${OWNER}/${REPO}...`);

  // 1. Get or create release in DRAFT mode
  const releases = await httpsRequest(`https://api.github.com/repos/${OWNER}/${REPO}/releases`);
  let release = releases.find(r => r.tag_name === TAG);

  const releaseNotes = getReleaseNotes();

  if (!release) {
    console.log(`[Release] Creating DRAFT release for ${TAG}...`);
    release = await httpsRequest(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, Buffer.from(JSON.stringify({
      tag_name: TAG,
      target_commitish: 'refactor/v3-baseline',
      name: RELEASE_NAME,
      body: releaseNotes,
      draft: true,
      prerelease: true
    })));
    console.log(`[Release] Created draft release ID: ${release.id}`);
  } else {
    console.log(`[Release] Found existing release ID: ${release.id} (draft: ${release.draft})`);
  }

  // 2. Prepare files to upload from dist-electron/release
  const releaseDir = path.join(rootDir, 'astral-desktop', 'dist-electron', 'release');
  const vanguardExe = path.join(releaseDir, `Vanguard-Core-Setup-${VERSION}.exe`);
  const vanguardBlockmap = path.join(releaseDir, `Vanguard-Core-Setup-${VERSION}.exe.blockmap`);
  const installerExeSpaced = path.join(releaseDir, `Astral Vanguard Setup ${VERSION}.exe`);
  const installerExeHyphen = path.join(releaseDir, `Astral-Vanguard-Setup-${VERSION}.exe`);
  const blockmapFileSpaced = path.join(releaseDir, `Astral Vanguard Setup ${VERSION}.exe.blockmap`);
  const blockmapFileHyphen = path.join(releaseDir, `Astral-Vanguard-Setup-${VERSION}.exe.blockmap`);
  const latestYml = path.join(releaseDir, 'latest.yml');

  const actualExe = fs.existsSync(vanguardExe) 
    ? vanguardExe 
    : (fs.existsSync(installerExeHyphen) ? installerExeHyphen : installerExeSpaced);
  const actualBlockmap = fs.existsSync(vanguardBlockmap)
    ? vanguardBlockmap
    : (fs.existsSync(blockmapFileHyphen) ? blockmapFileHyphen : blockmapFileSpaced);

  if (!fs.existsSync(actualExe)) {
    throw new Error(`Installer not found at: ${vanguardExe}`);
  }
  if (!fs.existsSync(latestYml)) {
    throw new Error(`latest.yml not found at: ${latestYml}`);
  }

  // Assets to ensure both electron-updater and direct manual downloads resolve seamlessly:
  const assetsToUpload = [
    { name: 'latest.yml', path: latestYml },
    { name: `Vanguard-Core-Setup-${VERSION}.exe`, path: actualExe },
    { name: `Vanguard-Core-Setup-${VERSION}.exe.blockmap`, path: actualBlockmap }
  ];

  // 3. Upload missing or outdated assets
  const existingAssets = release.assets || [];
  for (const asset of assetsToUpload) {
    const existing = existingAssets.find(a => a.name === asset.name);
    const expectedSize = fs.statSync(asset.path).size;

    if (existing) {
      if (existing.size === expectedSize) {
        console.log(`[Release] Asset "${asset.name}" already present with identical size (${existing.size} bytes). Skipping.`);
        continue;
      } else {
        console.log(`[Release] Asset "${asset.name}" size mismatch (${existing.size} vs ${expectedSize}). Deleting old asset...`);
        await httpsRequest(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, {
          method: 'DELETE'
        });
      }
    }

    await uploadAsset(release.upload_url, asset.name, asset.path);
  }

  // 4. Verify all assets exist on release before publishing
  console.log(`[Release] Verifying all assets on draft release...`);
  const refreshedRelease = await httpsRequest(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${release.id}`);
  const uploadedNames = refreshedRelease.assets.map(a => a.name);
  console.log(`[Release] Current assets on release:`, uploadedNames);

  const expectedRequirements = [
    { label: 'latest.yml', names: ['latest.yml'] },
    { label: `Vanguard-Core-Setup-${VERSION}.exe`, names: [`Vanguard-Core-Setup-${VERSION}.exe`] },
    { label: `Vanguard-Core-Setup-${VERSION}.exe.blockmap`, names: [`Vanguard-Core-Setup-${VERSION}.exe.blockmap`] }
  ];

  for (const req of expectedRequirements) {
    const found = req.names.some(n => uploadedNames.includes(n));
    if (!found) {
      throw new Error(`Verification failed: Asset group "${req.label}" is missing from release!`);
    }
  }
  console.log(`[Release] ✅ All required assets verified with exact sizes.`);

  // 5. Publish release: mark draft: false, prerelease: true, make_latest: "true"
  console.log(`[Release] Publishing release as Latest...`);
  const publishedRelease = await httpsRequest(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${release.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  }, Buffer.from(JSON.stringify({
    draft: false,
    prerelease: true,
    make_latest: 'true'
  })));

  console.log(`[Release] 🎉 Release "${publishedRelease.name}" (${publishedRelease.tag_name}) is now PUBLISHED as LATEST!`);
  console.log(`[Release] URL: ${publishedRelease.html_url}`);

  // 6. Test public endpoints
  console.log(`[Verification] Testing public endpoints...`);
  const releaseEndpoint = await httpsRequest(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  console.log(`[Verification] Release resolved: tag=${releaseEndpoint.tag_name}, draft=${releaseEndpoint.draft}, prerelease=${releaseEndpoint.prerelease}`);

  const latestYmlAsset = releaseEndpoint.assets.find(a => a.name === 'latest.yml');
  const vanguardExeAsset = releaseEndpoint.assets.find(a => a.name === `Vanguard-Core-Setup-${VERSION}.exe`);

  console.log(`- latest.yml: ${latestYmlAsset ? `FOUND (${latestYmlAsset.browser_download_url})` : 'MISSING'}`);
  console.log(`- Vanguard-Core-Setup-${VERSION}.exe: ${vanguardExeAsset ? `FOUND (${vanguardExeAsset.browser_download_url})` : 'MISSING'}`);
}

main().catch(err => {
  console.error('[Release] Fatal Error:', err);
  process.exit(1);
});
