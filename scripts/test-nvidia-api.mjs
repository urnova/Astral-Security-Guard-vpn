import https from 'https';

async function testEndpoint(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 300) }));
    }).on('error', err => resolve({ error: err.message }));
  });
}

async function main() {
  const candidates = [
    'https://www.nvidia.com/Download/API/lookupFP.aspx',
    'https://www.nvidia.com/en-us/geforce/drivers/',
    'https://api.github.com/repos/NVIDIA/open-gpu-kernel-modules/releases/latest',
  ];

  for (const c of candidates) {
    console.log('Testing:', c);
    const res = await testEndpoint(c);
    console.log(res);
  }
}

main();
