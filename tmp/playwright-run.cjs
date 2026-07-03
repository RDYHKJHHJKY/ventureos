const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const out = [];
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', (msg) => { out.push({ type: msg.type(), text: msg.text() }); console.log('CONSOLE', msg.type(), msg.text()); });
    page.on('pageerror', (err) => { out.push({ type: 'pageerror', text: err.message }); console.log('PAGEERROR', err.message); });
    page.on('requestfailed', (request) => { const failure = request.failure(); out.push({ type: 'requestfailed', url: request.url(), error: failure ? failure.errorText : '' }); console.log('REQUESTFAILED', request.url(), failure ? failure.errorText : ''); });
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
    out.push({ type: 'title', text: await page.title() });
    out.push({ type: 'body', text: await page.evaluate(() => document.body.innerText.slice(0, 300)) });
    await page.screenshot({ path: 'tmp/playwright-run.png', fullPage: true });
    await browser.close();
  } catch (e) {
    console.error('ERROR', e && e.message || e);
    out.push({ type: 'error', text: e && e.message || String(e) });
  } finally {
    fs.writeFileSync('tmp/playwright-run.log', JSON.stringify(out, null, 2));
  }
})();
