# Build instructions

## Prerequisites

* Linux (tested with Ubuntu 15.04 Server)
* Node (tested with 4.2.1)
* jspm (tested with 0.16.12)
* Emscripten (tested with 1.35.2)
  * Create a symlink: emgcc -> emcc

## Procedure
    git clone https://github.com/tbfleming/em-shell.git
    git clone https://github.com/tbfleming/em-busybox.git
    cd em-busybox
    make KBUILD_VERBOSE=1 SKIP_STRIP=y
    cd ../em-shell
    jspm install
    js/build
