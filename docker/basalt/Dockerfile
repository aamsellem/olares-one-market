# syntax=docker/dockerfile:1.7
# The Basalt engine for Olares One, built from anaelith (github.com/aamsellem/anaelith, MIT, branch `one`), our fork of
# Basalt (github.com/jesdga95/basalt, MIT): the fork's Linux release archive on a CUDA 13 runtime base, with its Python
# environment. The chart starts it through Model Console's wrapper; alone, the image runs `basalt`.
#
# The archive is not downloaded: the fork publishes no release. Make it from the fork's sources with
#   cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
#   python3 tools/package_release.py --tag v0.4.0-anaelith.1 --platform linux-x64
# and put it beside this file. The build stops if it is not the archive named here.
FROM docker.io/nvidia/cuda:13.0.2-runtime-ubuntu24.04
ARG BASALT_ARCHIVE=basalt-v0.4.0-anaelith.1-linux-x64.tar.gz
ARG BASALT_SHA256=31a7114ea73addedfa6a8e80c29ac6c1325d0f1696b993144cc3c96501de35ba
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 LANG=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN --mount=type=bind,source=${BASALT_ARCHIVE},target=/tmp/basalt.tar.gz \
    echo "${BASALT_SHA256}  /tmp/basalt.tar.gz" | sha256sum -c - \
    && mkdir /opt/basalt && tar -xzf /tmp/basalt.tar.gz -C /opt/basalt --strip-components=1 \
    && python3 -m venv /opt/basalt/.venv \
    && /opt/basalt/.venv/bin/pip install --no-cache-dir -r /opt/basalt/requirements.txt \
    && chmod -R a+rX /opt/basalt
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64
WORKDIR /opt/basalt
EXPOSE 8080
ENTRYPOINT ["/opt/basalt/bin/basalt"]
CMD ["--help"]
