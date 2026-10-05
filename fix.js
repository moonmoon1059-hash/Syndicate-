const fs = require('fs');

const files = [
  'server/whaleEngine.ts',
  'server/services/liveDataProvider.ts',
  'server/binance.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  code = code.replace(/\b(5000|6000|10000|35000)\b/g, '65000');
  code = code.replace(/fapi[0-9]?\.binance\.com/g, 'fapi3.binance.com');
  code = code.replace(/await\s+([a-zA-Z0-9_]+)\.json\(\)/g, (match, p1) => {
    return `(await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(${p1}))`;
  });

  fs.writeFileSync(file, code);
  console.log('Patched: ' + file);
});
