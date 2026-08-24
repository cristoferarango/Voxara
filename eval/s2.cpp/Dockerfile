FROM nvidia/cuda:12.8.0-devel-ubuntu24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake ninja-build git patch ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . /src

# libcuda.so.1 is provided at runtime by the NVIDIA container toolkit.
# The devel image only has the linker stub during build.
ENV LIBRARY_PATH=/usr/local/cuda/lib64/stubs
RUN ln -sf /usr/local/cuda/lib64/stubs/libcuda.so /usr/lib/x86_64-linux-gnu/libcuda.so.1 \
    && ln -sf /usr/local/cuda/lib64/stubs/libcuda.so /usr/lib/x86_64-linux-gnu/libcuda.so

# native arch detection fails at image build time (no GPU in docker build).
# RTX 5070 is SM120 (Blackwell). Patches are skipped because the bundled ggml
# commit already includes or rejects the local patch.
RUN cmake -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DS2_CUDA=ON \
        -DS2_AUTO_APPLY_LOCAL_PATCHES=OFF \
        -DCMAKE_CUDA_ARCHITECTURES=120 \
        -DCMAKE_EXE_LINKER_FLAGS="-L/usr/local/cuda/lib64/stubs -lcuda" \
    && cmake --build build --parallel

WORKDIR /work
ENTRYPOINT ["/src/build/s2"]
