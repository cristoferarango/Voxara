FROM nvidia/cuda:12.8.0-devel-ubuntu24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake ninja-build git patch ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY s2.cpp /src/s2.cpp
WORKDIR /src/s2.cpp

# libcuda.so.1 lo aporta el runtime de NVIDIA en el HOST en tiempo de ejecución.
# La imagen devel solo trae el stub del linker durante el build.
ENV LIBRARY_PATH=/usr/local/cuda/lib64/stubs
RUN ln -sf /usr/local/cuda/lib64/stubs/libcuda.so /usr/lib/x86_64-linux-gnu/libcuda.so.1 \
    && ln -sf /usr/local/cuda/lib64/stubs/libcuda.so /usr/lib/x86_64-linux-gnu/libcuda.so

# La detección 'native' de arquitectura falla en el build (no hay GPU visible
# durante `docker build`). Compilamos para Turing/Ampere/Ada/Blackwell; se puede
# afinar con: docker build --build-arg CUDA_ARCHS="86;89" ...
ARG CUDA_ARCHS=75;86;89;120

RUN cmake -B build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DS2_CUDA=ON \
      -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHS}" \
      -DCMAKE_EXE_LINKER_FLAGS="-L/usr/local/cuda/lib64/stubs -lcuda" \
    && cmake --build build --parallel

WORKDIR /work
ENTRYPOINT ["/src/s2.cpp/build/s2"]
