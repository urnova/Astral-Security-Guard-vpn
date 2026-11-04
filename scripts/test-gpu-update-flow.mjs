import https from 'https';

export async function checkNvidiaDriverUpdate(installedVersion) {
  // Query official NVIDIA AjaxDriverService for RTX 3060 Ti Desktop (Windows 11)
  const url = 'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=114&pfid=929&osID=135&languageCode=1036&beta=0&isWHQL=1&dltype=-1&dch=1&upCRD=0&sort1=0&numberOfResults=1';
  
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const dlInfo = json?.IDS?.[0]?.downloadInfo;
          if (!dlInfo || !dlInfo.Version) {
            resolve({
              success: false,
              status: 'check_failed',
              error: 'Réponse NVIDIA vide ou invalide.',
            });
            return;
          }

          const latestVersion = dlInfo.Version;
          const releaseDate = dlInfo.ReleaseDateTime ? dlInfo.ReleaseDateTime.replace(/%20/g, ' ') : '';
          const downloadUrl = dlInfo.DownloadURL;
          const detailsUrl = dlInfo.DetailsURL;
          const sizeDisplay = dlInfo.DownloadURLFileSize || 'Inconnue';

          // Numeric comparison
          const installedNum = parseFloat(installedVersion) || 0;
          const latestNum = parseFloat(latestVersion) || 0;
          const updateAvailable = latestNum > installedNum;

          resolve({
            success: true,
            status: updateAvailable ? 'update_available' : 'up_to_date',
            installedVersion,
            latestVersion,
            releaseDate,
            downloadUrl,
            detailsUrl,
            sizeDisplay,
            updateAvailable,
            driverName: dlInfo.Name ? decodeURIComponent(dlInfo.Name) : 'Pilote GeForce Game Ready WHQL',
          });
        } catch (err) {
          resolve({
            success: false,
            status: 'check_failed',
            error: err.message,
          });
        }
      });
    }).on('error', (err) => {
      resolve({
        success: false,
        status: 'network_error',
        error: err.message,
      });
    });
  });
}

async function run() {
  console.log('Testing checkNvidiaDriverUpdate with installed version 617.42...');
  const res = await checkNvidiaDriverUpdate('617.42');
  console.log('Update Check Result:', JSON.stringify(res, null, 2));

  // Also verify that downloadUrl is reachable with a HEAD request
  if (res.downloadUrl) {
    console.log('\nChecking HEAD on DownloadURL:', res.downloadUrl);
    const headRes = await new Promise((resolve) => {
      const req = https.request(res.downloadUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }, (hRes) => {
        resolve({
          statusCode: hRes.statusCode,
          contentLength: hRes.headers['content-length'],
          contentType: hRes.headers['content-type'],
        });
      });
      req.on('error', err => resolve({ error: err.message }));
      req.end();
    });
    console.log('Download URL HEAD check:', headRes);
  }
}

run();
