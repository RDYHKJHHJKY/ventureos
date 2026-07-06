import React from 'react';

export default function Tutorial() {
  return (
    <div style={{ maxWidth: 860 }}>
      <h2>VentureOS Quick Start Tutorial</h2>
      <ol>
        <li>Create a workspace via the UI (Sign up) or use demo mode.</li>
        <li>Add integrations: open Command Bar (press Ctrl+K) and run "Connect GitHub integration", or visit Integrations page.</li>
        <li>Add APIs: Use Integrations to register API endpoints and rotate keys as needed.</li>
        <li>Run a scan: From the Analyze page, start an analysis and issue passports.</li>
        <li>Publish: Deploy your app via Vercel or run locally with `npm run dev`.</li>
      </ol>
      <h3>Google Sign-in</h3>
      <p>To enable Google Sign-in, set the `GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` environment variables, and configure a Google OAuth client. Then use the "Sign in with Google" button on the Sign-in page.</p>
    </div>
  );
}
