import fs from 'fs';
import path from 'path';
import https from 'https';

const TOKEN = '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';
const OWNER = 'urnova';
const REPO = 'Astral-Security-Guard-vpn';
const TAG = 'v2.1.0';
const RELEASE_NAME = 'Astral Vanguard v2.1.0 - Protection & Anti-Lag Suite';
const RELEASE_BODY = `## ⚡ Astral Vanguard v2.1.0 - Release Officielle

Bienvenue dans la nouvelle génération d'Astral Vanguard, la suite tout-en-un de protection, optimisation gaming et dépannage système.

### 🚀 Nouveautés & Correctifs Majeurs :
* **⚡ SOS Déblocage Ping (1002ms)** : Purge d'urgence 1-click des sockets TCP/Winsock corrompus, vidage du cache DNS/ARP et coupure définitive de l'upload P2P furtif de Windows Update sans jamais avoir à redémarrer le PC.
* **⌨️ Docteur Clavier & Anti-Keylogger** : Désactivation des filtres touches rémanentes (FilterKeys/StickyKeys), optimisation de la réactivité d'amorce à 0ms, désactivation de la veille USB et scan des processus suspects.
* **🛡️ IA Heuristique Autonome (Zéro Clé API, Illimité)** : Moteur de détection hors-ligne capable d'isoler les spywares/malwares et de distinguer les faux-positifs gaming (cracks/patchers) avec génération de scripts de remédiation PowerShell en un clic.
* **🎮 Mode Gaming Extrême & Overlay HUD In-Game** : Priorité CPU maximale, désactivation des services d'arrière-plan et overlay transparent paramétrable avec raccourci global (\`Ctrl + Shift + O\`).
* **🔒 Tunnel VPN Astral Sécurisé** : Chiffrement AES-256 avec Kill-Switch et protection anti-fuite DNS.
* **🗔 Zone des Icônes Cachées & Auto-Start** : Minimisation discrète dans la barre des tâches au démarrage et surveillance en temps réel.
`;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, filePath, fileName, contentType) {
  return new Promise((resolve, reject) => {
    const uploadUrl = uploadUrlTemplate.replace(/\{.*?\}$/, `?name=${encodeURIComponent(fileName)}`);
    const fileStream = fs.readFileSync(filePath);
    const urlObj = new URL(uploadUrl);

    console.log(`Uploading ${fileName} (${(fileStream.length / 1024 / 1024).toFixed(2)} MB)...`);

    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          Authorization: `token ${TOKEN}`,
          'User-Agent': 'Astral-Publisher',
          'Content-Type': contentType,
          'Content-Length': fileStream.length,
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (d) => (respData += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ Uploaded ${fileName} successfully!`);
            resolve(true);
          } else {
            console.error(`❌ Failed to upload ${fileName}: HTTP ${res.statusCode}`, respData);
            resolve(false);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(fileStream);
    req.end();
  });
}

async function main() {
  console.log(`🔍 Vérification de la release ${TAG} sur GitHub...`);

  // 1. Check existing release
  let releaseRes = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
    method: 'GET',
    headers: {
      Authorization: `token ${TOKEN}`,
      'User-Agent': 'Astral-Publisher',
    },
  });

  let release = releaseRes.data;

  // 2. Create release if not found
  if (releaseRes.status === 404 || !release?.id) {
    console.log(`🚀 Création de la release ${TAG}...`);
    const createRes = await request(
      {
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}/releases`,
        method: 'POST',
        headers: {
          Authorization: `token ${TOKEN}`,
          'User-Agent': 'Astral-Publisher',
          'Content-Type': 'application/json',
        },
      },
      {
        tag_name: TAG,
        name: RELEASE_NAME,
        body: RELEASE_BODY,
        draft: false,
        prerelease: false,
      }
    );

    if (createRes.status !== 201) {
      console.error('❌ Échec de la création de la release:', createRes.data);
      process.exit(1);
    }
    release = createRes.data;
    console.log(`✅ Release créée avec succès (ID: ${release.id}) !`);
  } else {
    console.log(`ℹ️ Release existante trouvée (ID: ${release.id})`);
  }

  // 3. Find files in dist-electron/release
  const releaseDir = path.resolve('astral-desktop/dist-electron/release');
  if (!fs.existsSync(releaseDir)) {
    console.error(`❌ Le dossier ${releaseDir} n'existe pas encore. Attente du build.`);
    process.exit(1);
  }

  const files = fs.readdirSync(releaseDir);
  console.log('Fichiers disponibles dans release :', files);

  // Upload .exe, latest.yml, and .blockmap
  for (const f of files) {
    const fullPath = path.join(releaseDir, f);
    if (f.endsWith('.exe')) {
      await uploadAsset(release.upload_url, fullPath, f, 'application/octet-stream');
    } else if (f === 'latest.yml') {
      await uploadAsset(release.upload_url, fullPath, f, 'text/yaml');
    } else if (f.endsWith('.blockmap')) {
      await uploadAsset(release.upload_url, fullPath, f, 'application/octet-stream');
    }
  }

  console.log(`🎉 Toutes les ressources ont été publiées sur https://github.com/${OWNER}/${REPO}/releases/tag/${TAG} !`);
}

main().catch(console.error);
