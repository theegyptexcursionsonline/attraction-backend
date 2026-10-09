import http from 'http';
import supertest from 'supertest';

/**
 * Supertest for the suites, with each request's server bound to 127.0.0.1. Use it like supertest:
 * `request(app).get('/api/...')`.
 *
 * Supertest starts that server with `listen(0)`, which binds every address, and sends the request to
 * http://127.0.0.1:<port>. On macOS another process can still bind 127.0.0.1 on that port, and the
 * more specific bind then receives the request. mongodb-memory-server does this: it finds a port with
 * `listen(0)`, closes it and starts mongod on 127.0.0.1 a moment later. Under load, suites that pass
 * on their own failed with 404 "Tenant not found", 407 and `connect ETIMEDOUT`. When the server holds
 * 127.0.0.1 itself, that later bind fails with EADDRINUSE and the request reaches the app.
 */

const LOOPBACK = '127.0.0.1';

type App = Parameters<typeof supertest>[0];
type Agent = ReturnType<typeof supertest>;

/** Requests whose server is still binding: a listen on a named address has no port until 'listening'. */
const binding = new WeakMap<LoopbackTest, Promise<void>>();

class LoopbackTest extends supertest.Test {
  /** Called by supertest's constructor to build the request URL. */
  serverAddress(app: App, path: string): string {
    const server = app as http.Server;
    const address = server.address();
    if (address) {
      if (typeof address === 'string' || address.address !== LOOPBACK) {
        throw new Error(`request() needs a server listening on ${LOOPBACK}; this one listens on ${JSON.stringify(address)}`);
      }
      return super.serverAddress(app, path);
    }
    // Supertest closes `_server` once the response has arrived, as it does for its own listener.
    (this as unknown as { _server: http.Server })._server = server;
    binding.set(this, new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, LOOPBACK, () => {
        server.off('error', reject);
        resolve();
      });
    }));
    // `end` adds the origin once the port is known.
    return path;
  }

  end(callback?: supertest.CallbackHandler): this {
    const bound = binding.get(this);
    if (!bound) return super.end(callback);
    binding.delete(this);
    bound.then(
      () => {
        this.url = super.serverAddress(this.app, this.url);
        super.end(callback);
      },
      (error: Error) => (callback ? callback(error, undefined as never) : this.emit('error', error)),
    );
    return this;
  }
}

function request(app: http.RequestListener | http.Server): Agent {
  const agent: Record<string, (path: string) => supertest.Test> = {};
  for (const method of http.METHODS) agent[method.toLowerCase()] = (path) => new LoopbackTest(app, method, path);
  agent.del = agent.delete;
  return agent as unknown as Agent;
}

/** Supertest's types, under the same names (`request.Test`, `request.Response`). */
namespace request {
  export type Test = supertest.Test;
  export type Response = supertest.Response;
}

export default request;
