import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';
import { createApplication } from '../src/app-factory.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

let listenerPromise: Promise<RequestListener> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  listenerPromise ??= createApplication().then(
    (app) => app.getHttpAdapter().getInstance() as RequestListener,
  );
  const listener = await listenerPromise;
  listener(request, response);
}
