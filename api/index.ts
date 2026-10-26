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
  const backendModule = require('../backend/src/index');
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

  if (typeof app === 'function') {
    return app(req as any, res as any);
  }

  return res.status(500).json({
    error: 'App is not a callable Express application',
    type: typeof app,
  });
}
