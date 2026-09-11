FROM python:3.13-slim

WORKDIR /app

# Cached separately from the rest of the source so a code-only push doesn't reinstall torch.
COPY backend/requirements.txt ./backend/requirements.txt

# torch's default PyPI wheel for linux/aarch64 pulls the entire NVIDIA CUDA stack as hard
# dependencies -- nvidia-cudnn-cu13 alone is 651MB, plus cuda-toolkit/cuBLAS/cuSPARSE/cuSOLVER
# /NCCL, several GB in total. This image runs under Docker Desktop on Apple Silicon: there is
# no NVIDIA GPU and no CUDA passthrough, so none of it can ever be loaded -- it is pure image
# bloat, and this host runs close to full. Installing the CPU build of the SAME torch version
# first (2.14.0, exactly what the default resolution selects) leaves torch already satisfied,
# so the resolution below skips the CUDA variant entirely. Chronos-2 inference is CPU-only
# here either way, so this changes image size, not behaviour.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.14.0

RUN pip install --no-cache-dir -r backend/requirements.txt

# pip install only gets the chronos-forecasting PACKAGE -- the actual Chronos-2 weights are
# fetched lazily from HF Hub on first use. Pulling them now, while the build still has network
# access, means the image already has them cached before HF_HUB_OFFLINE=1 (below) takes effect
# -- otherwise the very first live request would have no cached weights to fall back to.
RUN python -c "from chronos import Chronos2Pipeline; Chronos2Pipeline.from_pretrained('amazon/chronos-2')"

# The whole repo, not just backend/ -- backend/data/*.json and the CSV are symlinks pointing
# up to the repo root (see backend/data/), so the root files have to be present in the image
# at the same relative layout for those links to resolve.
COPY . .

# Skips HF Hub's "check for a newer version" network call on every live forecast call, which is
# otherwise a real, observed multi-minute stall under unauthenticated rate limits (see
# backend/.env.example) -- safe now that the weights are already baked into the image above.
ENV HF_HUB_OFFLINE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
