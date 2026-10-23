import 'dotenv/config';
import { createApp } from './app.factory';
import { loadConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.PORT, '0.0.0.0');
}

void bootstrap();
