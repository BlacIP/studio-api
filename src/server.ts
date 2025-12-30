import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createApp } from './app.js';

const PORT = process.env.PORT || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Studio API running on port ${PORT}`);
});
