import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true, quiet: true });

if (process.env.OPENLINEAR_TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.OPENLINEAR_TEST_DATABASE_URL;
}

process.env.DATABASE_URL ??= 'postgresql://openlinear:openlinear@localhost:5432/openlinear';
process.env.JWT_SECRET ??= 'openlinear-dev-secret-change-in-production';
