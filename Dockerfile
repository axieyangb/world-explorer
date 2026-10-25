# Serves the app with server.py (static files + the /api/sky aircraft proxy).
FROM python:3.12-slim
WORKDIR /app
COPY . .
ENV PORT=8098
EXPOSE 8098
USER nobody
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/' % os.environ['PORT'], timeout=4)"
CMD ["python", "-u", "server.py"]
