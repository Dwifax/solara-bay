#!/usr/bin/env sh
# Builds the Solara Bay simulation core (rust/solara_core) for WebAssembly and copies it to
# game/wasm/solara_core.wasm, where game/src/core/wasmCore.js loads it. The built file is
# committed, so the game itself never needs a build step.
#   sh rust/build.sh          build and copy
#   sh rust/build.sh --test   run the crate's unit tests natively first
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
export PATH="$HOME/.cargo/bin:$PATH"
cd "$here/solara_core"
if [ "$1" = "--test" ]; then
  cargo test --release
fi
cargo build --release --target wasm32-unknown-unknown
mkdir -p "$root/game/wasm"
cp target/wasm32-unknown-unknown/release/solara_core.wasm "$root/game/wasm/solara_core.wasm"
echo "game/wasm/solara_core.wasm: $(wc -c < "$root/game/wasm/solara_core.wasm") bytes"
