import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import app from '../backend/src/index';

export default app;
