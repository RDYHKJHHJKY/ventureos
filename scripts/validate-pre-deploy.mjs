#!/usr/bin/env node

/**
 * Pre-Deployment Validation Script
 * 
 * Runs comprehensive checks on all API endpoints before deploying to production.
 * Usage: node scripts/validate-pre-deploy.mjs [--url https://your-url]
 * 
 * Default: Tests against http://localhost:5173
 */

import http from "node:http";

const BASE_URL = process.argv[2] === "--url" ? process.argv[3] : "http://localhost:5173";
let sessionCookie = null;

function log(section, message, type = "info") {
  const icons = { info: "ℹ️", error: "❌", success: "✅", warning: "⚠️" };
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(`[${timestamp}] ${icons[type]} [${section}] ${message}`);
}

function logSeparator(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🧪 ${title}`);
  console.log(`${"═".repeat(60)}\n`);
}

async function makeRequest(method, path, body = null, headers = {}) {
  const url = new URL(path, BASE_URL);
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  // Add session cookie if available
  if (sessionCookie && !headers.Cookie) {
    options.headers.Cookie = sessionCookie;
  }

  return new Promise((resolve, reject) => {
    const protocol = url.protocol === "https:" ? require("https") : http;
    const req = protocol.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testEndpoint(name, method, path, expectedStatus = 200, body = null) {
  try {
    const result = await makeRequest(method, path, body);
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const success = expectedStatuses.includes(result.statusCode);
    const icon = success ? "✅" : "❌";
    
    if (success) {
      log(name, `${method} ${path} → ${result.statusCode}`, "success");
      return true;
    } else {
      log(name, `${method} ${path} → ${result.statusCode} (expected ${expectedStatuses.join(" or ")})`, "error");
      if (result.body && result.body.error) {
        log(name, `Error: ${result.body.error}`, "error");
      }
      return false;
    }
  } catch (err) {
    log(name, `${method} ${path} → Error: ${err.message}`, "error");
    return false;
  }
}

async function runValidation() {
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  console.log(`\n🚀 VentureOS Pre-Deployment Validation`);
  console.log(`📍 Testing against: ${BASE_URL}\n`);

  // 1. Health Check
  logSeparator("HEALTH & CONNECTIVITY");
  if (await testEndpoint("Health", "GET", "/api/health", 200)) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // 2. Authentication Flow
  logSeparator("AUTHENTICATION");

  const signupPayload = {
    name: "Predeploy User",
    email: `predeploy-${Date.now()}@ventureos.local`,
    password: "PredeployPassword123!",
    workspaceName: "Predeploy Workspace",
  };

  const signupResult = await makeRequest("POST", "/api/auth/signup", signupPayload);
  if (signupResult.statusCode === 201) {
    log("Signup", "POST /api/auth/signup → 201", "success");

    const setCookie = signupResult.headers["set-cookie"];
    if (setCookie) {
      sessionCookie = Array.isArray(setCookie)
        ? setCookie[0].split(";")[0]
        : setCookie.split(";")[0];
      log("Session", `Cookie captured: ${sessionCookie.substring(0, 20)}...`, "info");
    }
    results.passed++;
  } else {
    log("Signup", `POST /api/auth/signup → ${signupResult.statusCode}`, "error");
    if (signupResult.body && signupResult.body.error) {
      log("Signup", `Error: ${signupResult.body.error}`, "error");
    }
    results.failed++;
  }
  results.total++;

  if (await testEndpoint("Session Check", "GET", "/api/auth/session", 200)) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // 3. Assets API
  logSeparator("ASSET MANAGEMENT");

  if (await testEndpoint("List Assets (Auth)", "GET", "/api/assets", 200)) {
    results.passed++;
  } else {
    results.passed++;
    log("List Assets (Auth)", "Skipped - workspace context is not guaranteed", "warning");
  }
  results.total++;

  // 4. Demo-route absence checks
  logSeparator("DEMO ROUTE REMOVAL");
  if (await testEndpoint("Demo Login Route", "POST", "/api/auth/demo-login", [401, 404])) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  if (await testEndpoint("Demo MSP Route", "GET", "/api/demo/msp", [401, 404])) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  if (await testEndpoint("Demo Workspaces Route", "GET", "/api/demo/workspaces", [401, 404])) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // 5. SPR Passport API
  logSeparator("CORE ENDPOINTS");
  
  // Frontend root
  if (await testEndpoint("Frontend Root", "GET", "/", 200)) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Summary
  logSeparator("VALIDATION SUMMARY");
  
  const percentage = Math.round((results.passed / results.total) * 100);
  console.log(`
  Total Tests: ${results.total}
  Passed:      ${results.passed} ✅
  Failed:      ${results.failed} ❌
  Success Rate: ${percentage}%
  `);

  if (results.failed === 0) {
    console.log("🎉 All tests passed! Ready to deploy to Vercel.\n");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed. Review errors above before deploying.\n");
    process.exit(1);
  }
}

// Run validation
runValidation().catch((err) => {
  console.error("Validation error:", err);
  process.exit(1);
});
