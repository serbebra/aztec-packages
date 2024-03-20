#!/usr/bin/env bash
set -eu

TARGET="stdlib_keccak_bench"
FILTER="RawIVCBench/Full/6$"
BUILD_DIR=build-op-count-time

# Move above script dir.
cd $(dirname $0)/..

# Measure the benchmarks with ops time counting
./scripts/benchmark_wasm_remote.sh stdlib_keccak_bench\
                              "./stdlib_keccak_bench --benchmark_filter=$FILTER\
                                                  --benchmark_out=$TARGET.json\
                                                  --benchmark_out_format=json"\
                              op-count-time\
                              build-op-count-time

# Retrieve output from benching instance
cd $BUILD_DIR
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/$TARGET.json .

# Analyze the results
cd ../
python3 ./scripts/analyze_client_ivc_bench.py
