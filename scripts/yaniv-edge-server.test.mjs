#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createYanivEdgeServer } from "./yaniv-edge-server.mjs";

async function listen(server, host = "127.0.0.1", port = 0) {
  server.listen(port, host);
  await once(server, "listening");
  return server.address();
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function request(url, options = {}) {
  const client = url.startsWith("https:") ? https : http;
  const headers = { connection: "close", ...(options.headers ?? {}) };
  return new Promise((resolve, reject) => {
    const req = client.request(url, { ...options, agent: false, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ res, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaniv-edge-"));
const certFile = path.join(tempDir, "cert.pem");
const keyFile = path.join(tempDir, "key.pem");

execFileSync("openssl", [
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  keyFile,
  "-out",
  certFile,
  "-subj",
  "/CN=localhost",
  "-days",
  "1",
], { stdio: "ignore" });

const backend = http.createServer((req, res) => {
  assert.equal(req.headers["x-forwarded-proto"], "https");
  res.writeHead(200, { connection: "close", "content-type": "text/plain" });
  res.end(`proxied ${req.url}`);
});

await listen(backend);
const backendAddress = backend.address();
const edge = createYanivEdgeServer({
  cert: fs.readFileSync(certFile),
  key: fs.readFileSync(keyFile),
  publicHost: "yaniv.example.test:7842",
  target: `http://127.0.0.1:${backendAddress.port}`,
});

await listen(edge);
const edgeAddress = edge.address();

try {
  const redirected = await request(`http://127.0.0.1:${edgeAddress.port}/play/yaniv?round=1`, {
    headers: { host: "yaniv.example.test:7842" },
  });
  assert.equal(redirected.res.statusCode, 308);
  assert.equal(redirected.res.headers.location, "https://yaniv.example.test:7842/play/yaniv?round=1");

  const proxied = await request(`https://127.0.0.1:${edgeAddress.port}/play/yaniv`, {
    rejectUnauthorized: false,
    headers: { host: "yaniv.example.test:7842" },
  });
  assert.equal(proxied.res.statusCode, 200);
  assert.equal(proxied.body, "proxied /play/yaniv");
} finally {
  edge.closeAllConnections?.();
  backend.closeAllConnections?.();
  await close(edge);
  await close(backend);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
