"""Static dev server for FIRST LIGHT: 127.0.0.1, no-store caching, correct MIME types."""
import argparse
import functools
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

MIME_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".vtt": "text/vtt",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2",
    ".css": "text/css",
    ".html": "text/html",
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **MIME_TYPES}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(Handler, directory=root)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"FIRST LIGHT dev server: http://127.0.0.1:{args.port}/")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
