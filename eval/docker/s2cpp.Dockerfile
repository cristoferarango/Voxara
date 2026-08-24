FROM nvidia/cuda:12.8.0-devel-ubuntu24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake ninja-build git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY s2.cpp /src/s2.cpp
WORKDIR /src/s2.cpp

RUN cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DS2_CUDA=ON \
    && cmake --build build --parallel

WORKDIR /work
ENTRYPOINT ["/src/s2.cpp/build/s2"]
