import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname, '../../../.env') });

import { createApp } from './app';

const app = createApp();
const PORT = Number(process.env.API_PORT ?? 3001);

app.listen(PORT, () => {
  console.log(`[API] Server running on http://localhost:${PORT}`);
  console.log(`[API] Health: http://localhost:${PORT}/health`);
});

export { app };
