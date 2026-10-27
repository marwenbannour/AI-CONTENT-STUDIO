import { createApplication } from './app-factory.js';

async function bootstrap() {
  const app = await createApplication();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
