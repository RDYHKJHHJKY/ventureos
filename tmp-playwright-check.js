const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
  page.on('requestfailed', (request) => { const failure = request.failure(); console.log('REQUESTFAILED', request.url(), failure ? failure.errorText : ''); });
  await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
  console.log('TITLE', await page.title());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('BODY', bodyText);
  await browser.close();
})();
