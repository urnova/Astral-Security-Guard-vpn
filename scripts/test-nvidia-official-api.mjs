import https from 'https';

function queryNvidia(psid, pfid, osId) {
  const url = `https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=${psid}&pfid=${pfid}&osID=${osId}&languageCode=1036&beta=0&isWHQL=1&dltype=-1&dch=1&upCRD=0&sort1=0&numberOfResults=3`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- TEST NVIDIA OFFICIAL LOOKUP API ---');
  // RTX 3060 Ti Desktop: psid=114 (GeForce RTX 30 Series), pfid=929 (GeForce RTX 3060 Ti)
  // osID 57: Windows 10 64-bit / osID 135: Windows 11
  const res11 = await queryNvidia(114, 929, 135);
  console.log('Result for Windows 11 (osID 135):', JSON.stringify(res11, null, 2).slice(0, 1500));
}

run();
