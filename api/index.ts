// Polyfill DOMMatrix & Path2D for Node.js / Serverless runtimes using pdf-parse v2
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}

import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import { VercelRequest, VercelResponse } from '@vercel/node';

let app: any = null;
let loadError: any = null;

try {
  let backendModule: any;
  try {
    backendModule = require('../backend/dist/index.js');
  } catch (_) {
    backendModule = require('../backend/src/index');
  }
  app = backendModule.default || backendModule;
} catch (err: any) {
  console.error('Fatal Backend Load Error:', err);
  loadError = {
    message: err?.message || String(err),
    stack: err?.stack,
    name: err?.name,
  };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (loadError) {
    return res.status(500).json({
      error: 'Backend Module Load Error in Serverless Function',
      details: loadError.message,
      stack: loadError.stack,
    });
  }

  // When running on Vercel, serverless runtime buffers request body and drains stream.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' && (req.body.trim().startsWith('{') || req.body.trim().startsWith('['))) {
      try {
        req.body = JSON.parse(req.body);
      } catch (_) {}
    } else if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString('utf8'));
      } catch (_) {}
    }
    (req as any)._body = true;
  } else if (req.readableEnded || req.complete) {
    (req as any)._body = true;
  }

  if (typeof app === 'function') {
    return app(req as any, res as any);
  }

  return res.status(500).json({
    error: 'App is not a callable Express application',
    type: typeof app,
  });
}
