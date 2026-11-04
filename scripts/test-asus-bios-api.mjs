import https from 'https';

async function testAsusWebapi() {
  const urls = [
    'https://rog.asus.com/support/webapi/product/GetPDBIOS?website=global&model=ROG-STRIX-Z370-F-GAMING&systemCode=rog',
    'https://rog.asus.com/support/webapi/product/GetPDBIOS?website=global&model=ROG%20STRIX%20Z370-F%20GAMING&systemCode=rog',
    'https://rog.asus.com/support/webapi/product/GetPDDrivers?website=global&model=ROG-STRIX-Z370-F-GAMING&systemCode=rog',
  ];

  for (const url of urls) {
    console.log(`\nURL: ${url}`);
    const res = await new Promise(resolve => {
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 1500) }));
      }).on('error', err => resolve({ error: err.message }));
    });
    console.log('Status:', res.status);
    console.log('Body:', res.body ? res.body.slice(0, 800) : res.error);
  }
}

testAsusWebapi();
