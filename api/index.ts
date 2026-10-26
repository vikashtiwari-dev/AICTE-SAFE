import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env.production') });
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
