import dotenv from 'dotenv';
dotenv.config();

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  type: 'postgres' | 'sqlite';
}
