import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables before any tests run
config({ path: resolve(process.cwd(), '.env.test') });

process.env.NODE_ENV = 'test';
