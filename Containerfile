ARG DENO_VERSION=2.9.7

FROM docker.io/denoland/deno:bin-${DENO_VERSION} AS deno

FROM registry.fedoraproject.org/fedora:44 AS tree-sitter

RUN dnf -y install --setopt=install_weak_deps=False cargo gcc \
    && dnf clean all

ARG TREE_SITTER_VERSION=0.27.0
RUN cargo install --locked tree-sitter-cli --version "${TREE_SITTER_VERSION}" --root /opt/tree-sitter

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
    && dnf clean all

COPY --from=tree-sitter /opt/tree-sitter/bin/tree-sitter /usr/local/bin/tree-sitter
COPY --from=deno /deno /usr/local/bin/deno

ENV DENO_NO_UPDATE_CHECK=1 \
    DENO_NO_PROMPT=1

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
    PATH=/opt/zed/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
