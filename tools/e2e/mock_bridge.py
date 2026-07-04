import json, base64, io, struct, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

def make_png(r, g, b):
    # 8x8 단색 PNG 생성 (의존성 없이)
    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
    w = h = 8
    raw = b''.join(b'\x00' + bytes([r, g, b]) * w for _ in range(h))
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw))
            + chunk(b'IEND', b''))

STATE = {
    'scene': '메인뷰',
    'commands': [],
}
IMAGES = {'메인뷰': make_png(200, 60, 60), '뷰2': make_png(60, 200, 60), '뷰3': make_png(60, 60, 200)}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, body, code=200):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(data)
    def do_OPTIONS(self):
        self._send({})
    def do_GET(self):
        if self.path == '/api/ping':
            self._send({'status': 'ok', 'app': 'VizMaker Bridge', 'port': 9876})
        elif self.path == '/api/data':
            img = base64.b64encode(IMAGES[STATE['scene']]).decode()
            self._send({'source': img, 'rendered': None, 'timestamp': 1})
        elif self.path == '/api/scenes':
            scenes = [{'name': n, 'active': n == STATE['scene']} for n in IMAGES]
            self._send({'scenes': scenes, 'timestamp': 1})
        else:
            self._send({'error': 'not found'}, 404)
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(n) or b'{}')
        if self.path == '/api/command':
            STATE['commands'].append(body)
            print('CMD:', body)
            if body.get('type') == 'select_scene':
                STATE['scene'] = body['name']
            self._send({'accepted': True})
        elif self.path == '/api/result':
            self._send({'received': True})
        else:
            self._send({'error': 'not found'}, 404)
    def do_QUERY(self):  # 상태 확인용
        pass

if __name__ == '__main__':
    print('mock bridge on 9876')
    ThreadingHTTPServer(('127.0.0.1', 9876), H).serve_forever()
