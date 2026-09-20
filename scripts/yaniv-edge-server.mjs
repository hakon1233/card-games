#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";

const DEFAULT_LISTEN_HOST = "127.0.0.1";
const DEFAULT_LISTEN_PORT = 3002;
const DEFAULT_TARGET = "http://127.0.0.1:3001";
const DEFAULT_PUBLIC_HOST = "127.0.0.1:3001";

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isPlainHttp(chunk) {
  return /^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|TRACE|CONNECT) /.test(
    chunk.toString("ascii", 0, Math.min(chunk.length, 16)),
  );
}

function parseHttpRedirectLocation(chunk, fallbackHost) {
  const request = chunk.toString("latin1", 0, Math.min(chunk.length, 8192));
  const requestTarget = request.match(/^[A-Z]+ ([^\s]+) HTTP\/\d(?:\.\d)?/m)?.[1] ?? "/";
  const host = request.match(/\r\nHost:\s*([^\r\n]+)/i)?.[1]?.trim() || fallbackHost;
  return `https://${host}${requestTarget}`;
}

function sendRedirect(socket, location) {
  const body = `Redirecting to ${location}\n`;
  socket.end(
    [
      "HTTP/1.1 308 Permanent Redirect",
      `Location: ${location}`,
      "Cache-Control: no-store",
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "",
      body,
    ].join("\r\n"),
  );
}

function buildProxyHeaders(request, target) {
  const headers = { ...request.headers };
  const forwardedHost = firstHeaderValue(request.headers.host);
  if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
  headers["x-forwarded-proto"] = "https";
  headers.host = target.host;
  return headers;
}

function proxyHttpRequest(request, response, target) {
  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: request.url,
      headers: buildProxyHeaders(request, target),
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("Bad gateway\n");
  });

  request.pipe(upstream);
}

function proxyUpgrade(request, socket, head, target) {
  const upstream = net.connect(Number(target.port), target.hostname, () => {
    upstream.write(
      `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n` +
        Object.entries(buildProxyHeaders(request, target))
          .map(([key, value]) => {
            const headerValue = Array.isArray(value) ? value.join(", ") : String(value ?? "");
            return `${key}: ${headerValue}`;
          })
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => {
    socket.destroy();
  });
}

export function createYanivEdgeServer(options) {
  const target = new URL(options.target ?? DEFAULT_TARGET);
  if (target.protocol !== "http:") {
    throw new Error(`Yaniv edge target must be http:, got ${target.protocol}`);
  }

  const publicHost = options.publicHost ?? DEFAULT_PUBLIC_HOST;
  const httpServer = http.createServer((request, response) => {
    proxyHttpRequest(request, response, target);
  });
  httpServer.on("upgrade", (request, socket, head) => {
    proxyUpgrade(request, socket, head, target);
  });
  httpServer.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  const tlsServer = tls.createServer(
    {
      cert: options.cert,
      key: options.key,
    },
    (tlsSocket) => {
      httpServer.emit("connection", tlsSocket);
    },
  );
  const tlsReady = new Promise((resolve) => {
    tlsServer.listen(0, "127.0.0.1", resolve);
  });

  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
    socket.on("error", () => {
      socket.destroy();
    });

    socket.once("data", (chunk) => {
      if (isPlainHttp(chunk)) {
        sendRedirect(socket, parseHttpRedirectLocation(chunk, publicHost));
        return;
      }

      socket.pause();
      tlsReady.then(() => {
        const tlsAddress = tlsServer.address();
        if (!tlsAddress || typeof tlsAddress !== "object") {
          socket.destroy();
          return;
        }

        const upstream = net.connect(tlsAddress.port, "127.0.0.1", () => {
          upstream.write(chunk);
          socket.pipe(upstream).pipe(socket);
          socket.resume();
        });
        socket.on("close", () => {
          upstream.destroy();
        });
        upstream.on("error", () => {
          socket.destroy();
        });
      });
    });
  });

  server.on("close", () => {
    tlsServer.close();
  });
  server.closeAllConnections = () => {
    for (const socket of sockets) socket.destroy();
  };

  return server;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const certFile = requiredEnv("YANIV_EDGE_CERT_FILE");
  const keyFile = requiredEnv("YANIV_EDGE_KEY_FILE");
  const listenHost = process.env.YANIV_EDGE_LISTEN_HOST ?? DEFAULT_LISTEN_HOST;
  const listenPort = Number(process.env.YANIV_EDGE_LISTEN_PORT ?? DEFAULT_LISTEN_PORT);
  const target = process.env.YANIV_EDGE_TARGET ?? DEFAULT_TARGET;
  const publicHost = process.env.YANIV_EDGE_PUBLIC_HOST ?? DEFAULT_PUBLIC_HOST;

  const server = createYanivEdgeServer({
    cert: fs.readFileSync(certFile),
    key: fs.readFileSync(keyFile),
    publicHost,
    target,
  });

  server.listen(listenPort, listenHost, () => {
    const address = server.address();
    const bound = typeof address === "object" && address ? `${address.address}:${address.port}` : String(address);
    console.log(`yaniv edge listening on ${bound}, proxying HTTPS to ${target}`);
  });
}
