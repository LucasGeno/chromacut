# chromacut container image — standalone public service for the lucasreed.me umbrella.
# Runs the FastAPI app on 0.0.0.0:6100. Contains NO auth code: access to the
# compute endpoints is gated at the Caddy edge via forward_auth (Topology A).
FROM python:3.12-slim

# uv for fast, lockfile-pinned dependency installs.
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

WORKDIR /app

# Install third-party deps from the lockfile first (cacheable layer). We run the
# app straight from source via PYTHONPATH rather than installing the package, so
# the static/ and guides/ data files are guaranteed present at runtime.
# --no-hashes keeps the export portable across the local (build-test) and droplet
# (deploy) architectures.
COPY pyproject.toml uv.lock README.md ./
RUN uv export --frozen --no-dev --no-emit-project --no-hashes -o requirements.txt \
    && uv pip install --system --no-cache -r requirements.txt

COPY src ./src
ENV PYTHONPATH=/app/src

# Run as non-root: the app decodes untrusted image uploads via Pillow/numpy/scipy
# native code, so drop root as defense-in-depth. It needs no write access (stateless,
# in-memory) and binds an unprivileged port.
RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 6100
CMD ["uvicorn", "chromacut.app:app", "--host", "0.0.0.0", "--port", "6100"]
