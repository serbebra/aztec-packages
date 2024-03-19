#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;

using Builder = bb::UltraCircuitBuilder;
using ProverInstance = bb::ProverInstance_<bb::UltraFlavor>;
using Prover = bb::UltraProver;
using Verifier = bb::UltraVerifier;
using VerificationKey = UltraFlavor::VerificationKey;

// constexpr size_t NUM_HASHES = 8;
// constexpr size_t BYTES_PER_CHUNK = 512;
// constexpr size_t START_BYTES = BYTES_PER_CHUNK - 9;
// constexpr size_t MAX_BYTES = START_BYTES + (BYTES_PER_CHUNK * (NUM_HASHES - 1));

class StdlibKeccakBench : public benchmark::Fixture {
  public:
    // Number of function circuits to accumulate(based on Zacs target numbers)

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    char get_random_char() { return static_cast<char>(bb::fr::random_element().data[0] % 8); }

    Builder generate_test_plonk_circuit(size_t num_bytes)
    {
        Builder builder;
        std::string in;
        in.resize(num_bytes);
        for (size_t i = 0; i < num_bytes; ++i) {
            in[i] = get_random_char();
        }
        bb::stdlib::byte_array<Builder> input(&builder, in);
        bb::stdlib::keccak<Builder>::hash(input);
        return builder;
    }
};

namespace {

BENCHMARK_DEFINE_F(StdlibKeccakBench, WitnessGeneration)(benchmark::State& state)
{
    for (auto _ : state) {
        auto builder = generate_test_plonk_circuit(static_cast<size_t>(state.range(0)));
    }
}

BENCHMARK_DEFINE_F(StdlibKeccakBench, Prove)(benchmark::State& state)
{
    for (auto _ : state) {
        state.PauseTiming();
        auto builder = generate_test_plonk_circuit(static_cast<size_t>(state.range(0)));
        state.ResumeTiming();
        auto instance = std::make_shared<ProverInstance>(builder);
        UltraProver prover(instance);
        auto proof = prover.construct_proof();
    }
}

BENCHMARK_DEFINE_F(StdlibKeccakBench, Full)(benchmark::State& state)
{
    for (auto _ : state) {
        auto builder = generate_test_plonk_circuit(static_cast<size_t>(state.range(0)));
        auto instance = std::make_shared<ProverInstance>(builder);
        UltraProver prover(instance);
        auto verification_key = std::make_shared<VerificationKey>(instance->proving_key);
        UltraVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);
        ASSERT(verified == true);
    }
}

#define ARGS Arg(32)->Arg(64)->Arg(128)->Arg(256)->Arg(512)->Arg(1024)->Arg(2048)

BENCHMARK_REGISTER_F(StdlibKeccakBench, WitnessGeneration)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(StdlibKeccakBench, Prove)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(StdlibKeccakBench, Full)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
