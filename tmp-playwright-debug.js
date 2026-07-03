const playwright = require('playwright');
(async () => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  let consoleMessages = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: err.message }));
  await page.goto('https://ventureos-kohl.vercel.app', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('bodyTextLength=' + bodyText.length);
  console.log('bodyText=' + JSON.stringify(bodyText.slice(0, 400)));
  console.log(JSON.stringify(consoleMessages, null, 2));
  const rootHtml = await page.locator('#root').innerHTML();
  console.log('rootHtml=' + JSON.stringify(rootHtml.slice(0,400)));
  await browser.close();
})();
