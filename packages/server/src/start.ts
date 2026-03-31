import { createGraphitiServer } from './app';
import { createGraphitiServerService } from './service';

const port = Number(process.env.PORT ?? '8080');
const service = await createGraphitiServerService();
const app = createGraphitiServer(service);

const server = Bun.serve({
  port,
  fetch: app.fetch
});

process.on('SIGINT', async () => {
  await service.close();
  server.stop(true);
});

process.on('SIGTERM', async () => {
  await service.close();
  server.stop(true);
});

console.log(`Graphiti server listening on http://localhost:${port}`);
