/**
 * The suites' request helper serves the app on 127.0.0.1, so no other socket can take the port its
 * requests go to. Supertest's own server listens on every address, and on macOS a later bind of
 * 127.0.0.1 on the same port receives its requests. That is how suites that pass on their own failed
 * under load with 404 "Tenant not found", 407 and `connect ETIMEDOUT`.
 */
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import supertest from 'supertest';
import request from '../test/loopbackRequest';

const others: net.Server[] = [];

const listen = <T extends net.Server>(server: T, port: number, host?: string) =>
  new Promise<T>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });

const close = (server: net.Server) =>
  new Promise<void>((resolve) => (server.listening ? server.close(() => resolve()) : resolve()));

/** Another socket on the port; it answers so a stolen request shows where it went. */
const otherSocket = () => http.createServer((_req, res) => res.end('other socket'));

const claim = async (port: number, host: string) => {
  const server = otherSocket();
  try {
    others.push(await listen(server, port, host));
    return 'bound';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code;
  }
};

/** A fresh connection to 127.0.0.1:<port>, the address supertest sends every request to. */
const fetchText = (port: number) =>
  new Promise<string>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/who', agent: false }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });

const who: http.RequestListener = (_req, res) => res.end('app');

/**
 * While the request is being served, other sockets claim its port the way mongod or a local proxy
 * does, then a new connection to 127.0.0.1 on that port shows who answers.
 */
const claimPortDuringRequest = async (requester: (app: http.RequestListener) => ReturnType<typeof supertest>) => {
  const app: http.RequestListener = async (req, res) => {
    if (req.url === '/who') return who(req, res);
    const port = req.socket.localPort as number;
    const loopback = await claim(port, '127.0.0.1');
    const wildcard = [await claim(port, '0.0.0.0'), await claim(port, '::')];
    const nextRequest = await fetchText(port);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ servedOn: req.socket.localAddress, loopback, wildcard, nextRequest }));
  };
  const response = await requester(app).get('/claim');
  expect(response.status).toBe(200);
  return response.body as { servedOn: string; loopback: string; wildcard: string[]; nextRequest: string };
};

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(others.splice(0).map(close));
});

describe('request()', () => {
  it('serves each request from its own server on 127.0.0.1 and closes that server afterwards', async () => {
    const createServer = jest.spyOn(http, 'createServer');
    const response = await request((req, res) => res.end(req.socket.localAddress)).post('/anything').send({ a: 1 });
    expect(response.status).toBe(200);
    expect(response.text).toBe('127.0.0.1');
    expect(createServer).toHaveBeenCalledTimes(1);
    expect((createServer.mock.results[0].value as http.Server).listening).toBe(false);
  });

  it('keeps its requests on the app when another socket binds 127.0.0.1 on the same port', async () => {
    const seen = await claimPortDuringRequest(request);
    expect(seen).toMatchObject({ servedOn: '127.0.0.1', loopback: 'EADDRINUSE', nextRequest: 'app' });
    // macOS lets other sockets hold the port on the wildcard addresses; they still get nothing.
    if (process.platform === 'darwin') expect(seen.wildcard).toEqual(['bound', 'bound']);
  });

  it("shows what it prevents: supertest's own server loses its requests to that bind on macOS", async () => {
    const seen = await claimPortDuringRequest(supertest);
    if (seen.loopback === 'bound') expect(seen.nextRequest).toBe('other socket');
    else expect(seen).toMatchObject({ loopback: 'EADDRINUSE', nextRequest: 'app' });
    if (process.platform === 'darwin') expect(seen).toMatchObject({ loopback: 'bound', nextRequest: 'other socket' });
  });

  it('fails the request, never hands it to another socket, when that socket already holds the port', async () => {
    const holder = await listen(otherSocket(), 0, '127.0.0.1');
    others.push(holder);
    const held = (holder.address() as net.AddressInfo).port;
    // The kernel never gives listen(0) a port in use; force the collision to cover this order too.
    const listenOriginal = net.Server.prototype.listen;
    jest.spyOn(net.Server.prototype, 'listen').mockImplementation(function (this: net.Server, ...args: unknown[]) {
      return listenOriginal.apply(this, (args[0] === 0 ? [held, ...args.slice(1)] : args) as Parameters<net.Server['listen']>);
    });
    await expect(request(who).get('/who')).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('uses a server that already listens on 127.0.0.1 and leaves it running', async () => {
    const server = await listen(http.createServer(who), 0, '127.0.0.1');
    try {
      expect((await request(server).get('/who')).text).toBe('app');
      expect(server.listening).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('refuses a server that listens on every address', async () => {
    const server = await listen(http.createServer(who), 0);
    try {
      expect(() => request(server).get('/who')).toThrow('request() needs a server listening on 127.0.0.1');
    } finally {
      await close(server);
    }
  });

  it('is how every suite reaches supertest', () => {
    const direct = (fs.readdirSync(__dirname, { recursive: true }) as string[])
      .filter((name) => /\.tsx?$/.test(name) && path.join(__dirname, name) !== __filename)
      .filter((name) => /from\s+['"]supertest['"]|require\(\s*['"]supertest['"]\s*\)/.test(fs.readFileSync(path.join(__dirname, name), 'utf8')));
    expect(direct).toEqual([]);
  });
});
