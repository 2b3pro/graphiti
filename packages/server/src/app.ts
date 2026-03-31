import type {
  AddEntityNodeRequestDto,
  AddMessagesRequestDto,
  GetMemoryRequestDto,
  SearchQueryDto
} from './dto';
import type { GraphitiServerService } from './service';

export function createGraphitiServer(service: GraphitiServerService) {
  return {
    fetch: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      try {
        if (request.method === 'GET' && pathname === '/healthcheck') {
          return json({ status: 'healthy' });
        }

        if (request.method === 'POST' && pathname === '/search') {
          const body = (await request.json()) as SearchQueryDto;
          const facts = await service.search(body);
          return json({ facts });
        }

        if (request.method === 'GET' && pathname.startsWith('/entity-edge/')) {
          const uuid = pathname.slice('/entity-edge/'.length);
          return json(await service.getEntityEdge(uuid));
        }

        if (request.method === 'GET' && pathname.startsWith('/episodes/')) {
          const groupId = pathname.slice('/episodes/'.length);
          const lastN = Number(url.searchParams.get('last_n') ?? '10');
          return json(await service.getEpisodes(groupId, lastN));
        }

        if (request.method === 'POST' && pathname === '/get-memory') {
          const body = (await request.json()) as GetMemoryRequestDto;
          return json({ facts: await service.getMemory(body) });
        }

        if (request.method === 'POST' && pathname === '/messages') {
          const body = (await request.json()) as AddMessagesRequestDto;
          await service.addMessages(body);
          return json(
            { message: 'Messages added to processing queue', success: true },
            { status: 202 }
          );
        }

        if (request.method === 'POST' && pathname === '/entity-node') {
          const body = (await request.json()) as AddEntityNodeRequestDto;
          return json(await service.addEntityNode(body), { status: 201 });
        }

        if (request.method === 'DELETE' && pathname.startsWith('/entity-edge/')) {
          const uuid = pathname.slice('/entity-edge/'.length);
          await service.deleteEntityEdge(uuid);
          return json({ message: 'Entity Edge deleted', success: true });
        }

        if (request.method === 'DELETE' && pathname.startsWith('/group/')) {
          const groupId = pathname.slice('/group/'.length);
          await service.deleteGroup(groupId);
          return json({ message: 'Group deleted', success: true });
        }

        if (request.method === 'DELETE' && pathname.startsWith('/episode/')) {
          const uuid = pathname.slice('/episode/'.length);
          await service.deleteEpisode(uuid);
          return json({ message: 'Episode deleted', success: true });
        }

        if (request.method === 'POST' && pathname === '/clear') {
          await service.clear();
          return json({ message: 'Graph cleared', success: true });
        }

        return json({ error: 'Not found' }, { status: 404 });
      } catch (error) {
        return handleError(error);
      }
    }
  };
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function handleError(error: unknown): Response {
  if (error instanceof Error) {
    const status =
      error.message.includes('not found')
        ? 404
        : error.message.includes('Not implemented')
          ? 501
          : 400;

    return json({ error: error.message }, { status });
  }

  return json({ error: 'Unknown error' }, { status: 500 });
}
