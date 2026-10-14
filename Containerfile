ARG BUN_VERSION=1.4.3

FROM docker.io/oven/bun:${BUN_VERSION}-distroless AS bun

FROM registry.fedoraproject.org/fedora:44 AS tree-sitter

RUN dnf -y install --setopt=install_weak_deps=False cargo gcc \
    && dnf clean all

ARG TREE_SITTER_VERSION=0.27.0
RUN cargo install --locked tree-sitter-cli --version "${TREE_SITTER_VERSION}" --root /opt/tree-sitter

FROM registry.fedoraproject.org/fedora:44 AS dprint

RUN dnf -y install --setopt=install_weak_deps=False cargo gcc \
    && dnf clean all

ARG DPRINT_VERSION=0.63.0
RUN cargo install --locked dprint --version "${DPRINT_VERSION}" --root /opt/dprint

FROM registry.fedoraproject.org/fedora:44 AS dev

RUN dnf -y install --setopt=install_weak_deps=False \
        gcc \
        libasan \
        libubsan \
        glibc-devel \
        clang \
        clang-tools-extra \
        binutils \
        binutils-aarch64-linux-gnu \
        arm-none-eabi-binutils-cs \
        gcc-aarch64-linux-gnu \
        arm-none-eabi-gcc-cs \
        nasm \
        yasm \
        ShellCheck \
    && dnf clean all

COPY --from=tree-sitter /opt/tree-sitter/bin/tree-sitter /usr/local/bin/tree-sitter
COPY --from=dprint /opt/dprint/bin/dprint /usr/local/bin/dprint
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

ENV BUN_INSTALL=/opt/bun \
    DO_NOT_TRACK=1 \
    PATH=/opt/bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin

ARG TYPESCRIPT_VERSION=7.0.2
ARG OXLINT_VERSION=1.88.0
ARG BUN_TYPES_VERSION=1.4.3
ARG TYPES_NODE_VERSION=26.2.0
ARG UNDICI_TYPES_VERSION=8.3.0
RUN bun install --global --exact \
        "typescript@${TYPESCRIPT_VERSION}" \
        "oxlint@${OXLINT_VERSION}" \
        "bun-types@${BUN_TYPES_VERSION}" \
        "@types/node@${TYPES_NODE_VERSION}" \
        "undici-types@${UNDICI_TYPES_VERSION}" \
    && rm -rf /opt/bun/install/cache

ADD --checksum=sha256:9c52244de2c25a33addc7ddacff4443234a2dc4b5d3f34131262d1e0df35007c --chmod=0644 \
    https://github.com/dprint/dprint-plugin-typescript/releases/download/0.96.1/plugin.wasm \
    /opt/dprint/typescript.wasm
ADD --checksum=sha256:811ca4c6f732bcd6f707bc2f42d42395bb4127cdf829960cf628a18fc149777e --chmod=0644 \
    https://github.com/dprint/dprint-plugin-json/releases/download/0.25.2/plugin.wasm \
    /opt/dprint/json.wasm
ADD --checksum=sha256:5cebd0459bf1aa13fb027331720158d03e2a897b1d9f7b3bf93cac661ca4ddbd --chmod=0644 \
    https://github.com/dprint/dprint-plugin-markdown/releases/download/0.26.0/plugin.wasm \
    /opt/dprint/markdown.wasm
ADD --checksum=sha256:40a2fdda7040317eb1b23520f3a00769a5571eedb049c4ca9175c1b9eeba01ae --chmod=0644 \
    https://github.com/g-plane/pretty_yaml/releases/download/v0.6.0/plugin.wasm \
    /opt/dprint/pretty_yaml.wasm

WORKDIR /work

FROM dev AS zed

RUN dnf -y install --setopt=install_weak_deps=False \
        xorg-x11-server-Xvfb \
        xdotool \
        xclip \
        xwd \
        netpbm-progs \
        mesa-vulkan-drivers \
        vulkan-loader \
        libxkbcommon-x11 \
        alsa-lib \
        dbus-daemon \
        git \
        lld \
        wasi-libc-devel \
        tar \
        gzip \
    && dnf clean all

ARG ZED_REFRESH=
RUN mkdir /opt/zed \
    && curl -f https://zed.dev/install.sh | HOME=/opt/zed sh

ENV ZED_ALLOW_EMULATED_GPU=1 \
    PATH=/opt/zed/.local/bin:/opt/bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
