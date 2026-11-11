'use strict';

/**
 * Local companion bridge for the Chrome/Edge extension.
 * MV3 extensions cannot run yt-dlp themselves. They POST jobs here while
 * FrameGrab Desktop is running on localhost.
 */
const http = require('http');
const { URL } = require('url');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-FrameGrab-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function createBridge({ port, getToken, onAnalyze, onEnqueue, onListJobs, onGetSettings }) {
  let server = null;

  const handler = async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const token = req.headers['x-framegrab-token'] || url.searchParams.get('token') || '';
    const expected = getToken();

    // Health is open so the extension can detect the app is running.
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        app: 'FrameGrab',
        bridge: true,
        authRequired: true,
      });
      return;
    }

    if (!expected || token !== expected) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized. Copy the bridge token from FrameGrab Settings.' });
      return;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/settings') {
        sendJson(res, 200, { ok: true, settings: onGetSettings() });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/jobs') {
        sendJson(res, 200, { ok: true, jobs: onListJobs() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/analyze') {
        const body = await readBody(req);
        const info = await onAnalyze(body.url);
        sendJson(res, 200, { ok: true, info });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/enqueue') {
        const body = await readBody(req);
        const created = await onEnqueue(body);
        sendJson(res, 200, { ok: true, jobs: created });
        return;
      }
      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message || String(err) });
    }
  };

  return {
    start() {
      return new Promise((resolve, reject) => {
        if (server) return resolve({ port });
        server = http.createServer(handler);
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve({ port }));
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => {
          server = null;
          resolve();
        });
      });
    },
  };
}

module.exports = { createBridge };
