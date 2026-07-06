Procurement PDF export

To enable server-side PDF export of procurement reports, install Puppeteer which downloads a compatible Chromium binary:

Install:

```bash
npm install puppeteer --no-audit --no-fund
```

If installing Puppeteer isn't possible in your environment, the server will fall back to returning an HTML report. You can still convert the HTML to PDF using external tools such as `wkhtmltopdf` or a headless browser on a CI worker.

Example conversion using Node and Puppeteer (once installed):

```bash
node -e "const fs=require('fs');const p=require('puppeteer');(async()=>{const b=await p.launch();const page=await b.newPage();const html=fs.readFileSync('report.html','utf8');await page.setContent(html);const pdf=await page.pdf({format:'A4',printBackground:true});fs.writeFileSync('report.pdf',pdf);await b.close();})();"
```
