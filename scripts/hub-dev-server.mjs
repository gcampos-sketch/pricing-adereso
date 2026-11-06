import http from 'node:http';
import net from 'node:net';

// The old public file server is replaced by a same-origin proxy to the authenticated app.
const server = http.createServer((request, response) => {
  const upstream = http.request({ hostname: '127.0.0.1', port: 8878, path: request.url, method: request.method, headers: request.headers }, incoming => {
    response.writeHead(incoming.statusCode ?? 502, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('El Hub está iniciando. Recarga en unos segundos.'); });
  request.pipe(upstream);
});
server.on('upgrade', (request, client, head) => {
  const upstream = net.connect(8878, '127.0.0.1', () => {
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n` + Object.entries(request.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream); upstream.pipe(client);
  });
  upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy()); client.on('close', () => upstream.destroy());
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(8877, '127.0.0.1', () => console.log('Hub comercial protegido: http://127.0.0.1:8877/'));
