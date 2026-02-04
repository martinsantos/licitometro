#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BUILD_DIR = Path(__file__).resolve().parents[1] / 'frontend' / 'build'

class SPAHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve files from build directory
        root = str(BUILD_DIR)
        return super().translate_path(path).replace(self.directory, root)

    def do_GET(self):
        # Try normal file
        path = (BUILD_DIR / self.path.lstrip('/')).resolve()
        if self.path == '/' or (path.exists() and path.is_file()):
            return super().do_GET()
        # Fallback to index.html for client-side routing
        self.path = '/index.html'
        return super().do_GET()

if __name__ == '__main__':
    handler = SPAHandler
    handler.directory = str(BUILD_DIR)
    httpd = ThreadingHTTPServer(('0.0.0.0', 3000), handler)
    print('Serving SPA on http://localhost:3000')
    httpd.serve_forever()
