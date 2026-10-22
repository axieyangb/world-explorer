#!/usr/bin/env python3
"""High-performance multithreaded HTTP server for Beijing 40km x 40km Open-World MVP."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent


class GameRequestHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

  def end_headers(self):
    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
    self.send_header('Access-Control-Allow-Origin', '*')
    super().end_headers()

  def log_message(self, fmt, *args):
    # Suppress per-chunk request spam in terminal
    if '/data/chunks/' not in (args[0] if args else ''):
      sys.stderr.write('%s - - [%s] %s\n' % (
          self.address_string(),
          self.log_date_time_string(),
          fmt % args,
      ))


def main():
  port = int(os.environ.get('PORT', '8098'))
  server = ThreadingHTTPServer(('0.0.0.0', port), GameRequestHandler)
  print(f'Beijing Open-World MVP server listening on http://0.0.0.0:{port}')
  sys.stdout.flush()
  server.serve_forever()


if __name__ == '__main__':
  main()
