import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../backend/src/index';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
