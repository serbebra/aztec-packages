
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;

using Builder = bb::GoblinUltraCircuitBuilder;
using ProverInstance = bb::ProverInstance_<bb::GoblinUltraFlavor>;
using Prover = bb::UltraProver;
using Verifier = bb::UltraVerifier;
using VerificationKey = GoblinUltraFlavor::VerificationKey;
// using Builder = GoblinUltraCircuitBuilder;
using VerifierFoldData = GoblinMockCircuits::VerifierFoldData;
using VerifierInstance = VerifierInstance_<GoblinUltraFlavor>;

// constexpr size_t NUM_HASHES = 8;
// constexpr size_t BYTES_PER_CHUNK = 512;
// constexpr size_t START_BYTES = BYTES_PER_CHUNK - 9;
// constexpr size_t MAX_BYTES = START_BYTES + (BYTES_PER_CHUNK * (NUM_HASHES - 1));

class RawIVCBench : public benchmark::Fixture {
  public:
    // Number of function circuits to accumulate(based on Zacs target numbers)

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    char get_random_char() { return static_cast<char>(bb::fr::random_element().data[0] % 8); }

    static std::shared_ptr<VerifierInstance> construct_mock_folding_kernel(
        Builder& builder,
        const VerifierFoldData& func,
        const VerifierFoldData& kernel,
        std::shared_ptr<VerifierInstance>& prev_kernel_accum)
    {
        using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
        using RecursiveVerifierInstances =
            bb::stdlib::recursion::honk::RecursiveVerifierInstances_<GURecursiveFlavor, 2>;
        using FoldingRecursiveVerifier =
            bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

        // Add operations representing general kernel logic e.g. state updates. Note: these are structured to make
        // the kernel "full" within the dyadic size 2^17 (130914 gates)
        stdlib::generate_sha256_test_circuit(builder, 1);

        // // Initial kernel iteration does not have a previous kernel to fold
        if (kernel.fold_proof.empty()) {
            std::cout << "eeempty" << std::endl;
            FoldingRecursiveVerifier verifier_1{ &builder, prev_kernel_accum, { func.inst_vk } };
            auto fctn_verifier_accum = verifier_1.verify_folding_proof(func.fold_proof);
            return std::make_shared<VerifierInstance>(fctn_verifier_accum->get_value());
        }
        std::cout << "not empty?" << std::endl;
        FoldingRecursiveVerifier verifier_2{ &builder, prev_kernel_accum, { kernel.inst_vk } };
        auto kernel_verifier_accum = verifier_2.verify_folding_proof(kernel.fold_proof);
        return std::make_shared<VerifierInstance>(kernel_verifier_accum->get_value());
    }

    void construct_mock_function_circuit(Builder& builder)
    {
        stdlib::field_t<Builder> a = stdlib::witness_t<Builder>(&builder, 100);
        stdlib::field_t<Builder> b = stdlib::witness_t<Builder>(&builder, 110);
        stdlib::field_t<Builder> c = stdlib::witness_t<Builder>(&builder, 210);
        auto d = a + b;
        d.assert_equal(c);
        stdlib::generate_sha256_test_circuit(builder, 1); // min gates: ~39k
        MockCircuits::construct_goblin_ecc_op_circuit(builder);
    }

    void precompute_folding_verification_keys(bb::ClientIVC& ivc)
    {
        std::cout << "fa" << std::endl;
        using VerifierInstance = VerifierInstance_<GoblinUltraFlavor>;

        ClientIVC::ClientCircuit initial_function_circuit{ 1 << 15, ivc.goblin.op_queue };

        construct_mock_function_circuit(initial_function_circuit);

        // ivc.goblin.merge(initial_function_circuit); // Construct new merge proof
        // ivc.prover_fold_output.accumulator = std::make_shared<ProverInstance>(initial_function_circuit);

        // Initialise both the first prover and verifier accumulator from the inital function circuit
        ivc.initialize(initial_function_circuit);
        std::cout << "fbb" << std::endl;
        ivc.vks.first_func_vk = std::make_shared<VerificationKey>(ivc.prover_fold_output.accumulator->proving_key);
        std::cout << "fbd" << std::endl;
        auto initial_verifier_acc = std::make_shared<VerifierInstance>(ivc.vks.first_func_vk);

        ClientIVC::ClientCircuit function_circuit{ 1 << 15, ivc.goblin.op_queue };
        construct_mock_function_circuit(function_circuit);
        auto function_fold_proof = ivc.accumulate(function_circuit);
        ivc.vks.func_vk = std::make_shared<VerificationKey>(ivc.prover_instance->proving_key);

        //    auto function_fold_proof = ivc.accumulate(initial_function_circuit);
        std::cout << "fc" << std::endl;

        // Accumulate the next function circuit
        // ClientIVC::ClientCircuit function_circuit{ goblin.op_queue };
        // GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
        // auto function_fold_proof = accumulate(function_circuit);

        // Create its verification key (we have called accumulate so it includes the recursive merge verifier)
        // vks.func_vk = std::make_shared<VerificationKey>(prover_instance->proving_key);

        // Create the initial kernel iteration and precompute its verification key
        ClientIVC::ClientCircuit kernel_circuit{ 1 << 15, ivc.goblin.op_queue };
        auto kernel_acc = construct_mock_folding_kernel(
            kernel_circuit, { function_fold_proof, ivc.vks.func_vk }, {}, initial_verifier_acc);
        std::cout << "fd" << std::endl;

        auto kernel_fold_proof = ivc.accumulate(kernel_circuit);
        std::cout << "fe" << std::endl;

        ivc.vks.first_kernel_vk = std::make_shared<VerificationKey>(ivc.prover_instance->proving_key);

        // Create another mock function circuit to run the full kernel
        // auto function_circuit = ClientIVC::ClientCircuit{ ivc.goblin.op_queue };
        // GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
        // function_fold_proof = accumulate(function_circuit);
        std::cout << "fab" << std::endl;

        // Create the full kernel circuit and compute verification key
        kernel_circuit = GoblinUltraCircuitBuilder{ 1 << 15, ivc.goblin.op_queue };
        kernel_acc = construct_mock_folding_kernel(
            kernel_circuit, {}, { kernel_fold_proof, ivc.vks.first_kernel_vk }, kernel_acc);
        kernel_fold_proof = ivc.accumulate(kernel_circuit);

        ivc.vks.kernel_vk = std::make_shared<VerificationKey>(ivc.prover_instance->proving_key);

        // Clean the Goblin state (reinitialise op_queue with mocking and clear merge proofs)
        ivc.goblin = Goblin();
        std::cout << "b" << std::endl;
    }

    // TODOS:::::
    //  1: find nice way to bootstrap an accumulator
    //     i.e. circuit that ASSIGNS an instance to an accumulator instead of folds
    //  2: remove need for goblin ops in function circuits
    void evaluate_ivc(size_t, bb::ClientIVC& ivc)
    {
        // std::cout << "ac" << std::endl;

        // std::cout << "ba" << std::endl;
        // Builder initial_function_circuit{ 1 << 15 };

        // std::cout << "bb" << std::endl;
        // construct_mock_function_circuit(initial_function_circuit);

        // std::cout << "bc" << std::endl;
        // initial_function_circuit.op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
        // std::cout << "bd" << std::endl;
        // ivc.initialize(initial_function_circuit);
        // std::cout << "be" << std::endl;
        // std::swap(*ivc.goblin.op_queue, *initial_function_circuit.op_queue);
        // std::cout << "bf" << std::endl;

        // auto function_fold_proof = ivc.accumulate(initial_function_circuit);
        // std::cout << "bg" << std::endl;
        // VerifierFoldData function_fold_output = { function_fold_proof, ivc.vks.func_vk };
        // std::cout << "bh" << std::endl;

        // // // The accumulator for kernel uses the function accumulation verification key
        // auto kernel_verifier_accumulator = std::make_shared<ClientIVC::VerifierInstance>(ivc.vks.first_func_vk);
        // // std::cout << "bi" << std::endl;

        precompute_folding_verification_keys(ivc);

        std::vector<Builder> initial_function_circuits(2);

        // Construct 2 starting function circuits in parallel
        {
            BB_OP_COUNT_TIME_NAME("construct_circuits");
            parallel_for(2, [&](size_t circuit_index) {
                construct_mock_function_circuit(initial_function_circuits[circuit_index]);
            });
        };

        // Prepend queue to the first circuit
        initial_function_circuits[0].op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
        // Initialize ivc
        ivc.initialize(initial_function_circuits[0]);
        // Retrieve the queue
        std::swap(*ivc.goblin.op_queue, *initial_function_circuits[0].op_queue);

        // Prepend queue to the second circuit
        initial_function_circuits[1].op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
        // Accumulate another function circuit
        auto function_fold_proof = ivc.accumulate(initial_function_circuits[1]);
        // Retrieve the queue
        std::swap(*ivc.goblin.op_queue, *initial_function_circuits[1].op_queue);
        VerifierFoldData function_fold_output = { function_fold_proof, ivc.vks.func_vk };

        // Free memory
        initial_function_circuits.clear();

        VerifierFoldData kernel_fold_output;
        auto kernel_verifier_accumulator = std::make_shared<ClientIVC::VerifierInstance>(ivc.vks.first_func_vk);

        size_t NUM_CIRCUITS = 10;
        size_t size_hint = 1 << 15;
        std::cout << "d" << std::endl;
        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            Builder kernel_circuit{ size_hint, ivc.goblin.op_queue };

            if (circuit_idx == 0) {
                //         kernel_verifier_accumulator = construct_mock_folding_kernel(
                // kernel_circuit, {}, {}, kernel_verifier_accumulator);
                kernel_circuit.op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
                kernel_verifier_accumulator = construct_mock_folding_kernel(
                    kernel_circuit, function_fold_output, {}, kernel_verifier_accumulator);
            } else {
                kernel_verifier_accumulator = construct_mock_folding_kernel(
                    kernel_circuit, function_fold_output, kernel_fold_output, kernel_verifier_accumulator);
            }

            ClientIVC::FoldProof kernel_fold_proof = ivc.accumulate(kernel_circuit);

            // First iteration and the following ones differ
            if (circuit_idx == 0) {
                kernel_fold_output = { kernel_fold_proof, ivc.vks.first_kernel_vk };
            } else {
                kernel_fold_output = { kernel_fold_proof, ivc.vks.kernel_vk };
            }
        }

        std::cout << "e" << std::endl;
        Builder kernel_circuit{ size_hint, ivc.goblin.op_queue };
        {
            BB_OP_COUNT_TIME_NAME("construct_circuits");
            kernel_verifier_accumulator = construct_mock_folding_kernel(
                kernel_circuit, function_fold_output, kernel_fold_output, kernel_verifier_accumulator);
        }

        auto kernel_fold_proof = ivc.accumulate(kernel_circuit);
        kernel_fold_output = { kernel_fold_proof, ivc.vks.kernel_vk };

        std::cout << "f" << std::endl;
        ivc.goblin.prove_eccvm();
        ivc.goblin.prove_translator();
    }
};

namespace {

BENCHMARK_DEFINE_F(RawIVCBench, Prove)(benchmark::State& state)
{
    for (auto _ : state) {
        bb::ClientIVC ivc;
        evaluate_ivc(static_cast<size_t>(state.range(0)), ivc);
    }
}

// BENCHMARK_DEFINE_F(RawIVCBench, Prove)(benchmark::State& state)
// {
//     for (auto _ : state) {
//         state.PauseTiming();
//         auto builder = generate_test_plonk_circuit(static_cast<size_t>(state.range(0)));
//         state.ResumeTiming();
//         auto instance = std::make_shared<ProverInstance>(builder);
//         UltraProver prover(instance);
//         auto proof = prover.construct_proof();
//     }
// }

// BENCHMARK_DEFINE_F(StdlibKeccakBench, Full)(benchmark::State& state)
// {
//     for (auto _ : state) {
//         auto builder = generate_test_plonk_circuit(static_cast<size_t>(state.range(0)));
//         auto instance = std::make_shared<ProverInstance>(builder);
//         UltraProver prover(instance);
//         auto verification_key = std::make_shared<VerificationKey>(instance->proving_key);
//         UltraVerifier verifier(verification_key);
//         auto proof = prover.construct_proof();
//         bool verified = verifier.verify_proof(proof);
//         ASSERT(verified == true);
//     }
// }

#define ARGS Arg(32)
// ->Arg(64)->Arg(128)->Arg(256)->Arg(512)->Arg(1024)->Arg(2048)

BENCHMARK_REGISTER_F(RawIVCBench, Prove)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(StdlibKeccakBench, Prove)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(StdlibKeccakBench, Full)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();

// #include <benchmark/benchmark.h>

// #include "barretenberg/client_ivc/client_ivc.hpp"
// #include "barretenberg/common/op_count.hpp"
// #include "barretenberg/common/op_count_google_bench.hpp"
// #include "barretenberg/goblin/mock_circuits.hpp"
// #include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
// #include "barretenberg/ultra_honk/ultra_verifier.hpp"

// using namespace benchmark;
// using namespace bb;

// namespace {

// /**
//  * @brief Benchmark suite for the aztec client PG-Goblin IVC scheme
//  *
//  */
// class RawIVCBench : public benchmark::Fixture {
//   public:
//     using Builder = GoblinUltraCircuitBuilder;
//     using VerifierFoldData = GoblinMockCircuits::VerifierFoldData;
//     using VerifierInstance = VerifierInstance_<GoblinUltraFlavor>;
//     // using VerificationKey = Flavor::VerificationKey;

//     // Number of function circuits to accumulate(based on Zacs target numbers)
//     static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 6;

//     void SetUp([[maybe_unused]] const ::benchmark::State& state) override
//     {
//         bb::srs::init_crs_factory("../srs_db/ignition");
//         bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
//     }

//     static std::shared_ptr<VerifierInstance> construct_mock_recursive_function(
//         Builder& builder,
//         const VerifierFoldData& func,
//         const VerifierFoldData& kernel,
//         std::shared_ptr<VerifierInstance>& prev_kernel_accum)
//     {
//         using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
//         using RecursiveVerifierInstances =
//             bb::stdlib::recursion::honk::RecursiveVerifierInstances_<GURecursiveFlavor, 2>;
//         using FoldingRecursiveVerifier =
//             bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

//         // Add operations representing general kernel logic e.g. state updates. Note: these are structured to make
//         // the kernel "full" within the dyadic size 2^17 (130914 gates)

//         // // Initial kernel iteration does not have a previous kernel to fold
//         if (kernel.fold_proof.empty()) {
//             FoldingRecursiveVerifier verifier_1{ &builder, prev_kernel_accum, { func.inst_vk } };
//             auto fctn_verifier_accum = verifier_1.verify_folding_proof(func.fold_proof);
//             return std::make_shared<VerifierInstance>(fctn_verifier_accum->get_value());
//         }

//         FoldingRecursiveVerifier verifier_2{ &builder, prev_kernel_accum, { kernel.inst_vk } };
//         auto kernel_verifier_accum = verifier_2.verify_folding_proof(kernel.fold_proof);
//         return std::make_shared<VerifierInstance>(kernel_verifier_accum->get_value());
//     }

//     static void perform_ivc_accumulation_roundss(State& state, ClientIVC& ivc)
//     {
//         // const size_t size_hint = 1 << 16; // hmm?
//         Builder function_circuit;
//         {
//             stdlib::field_t<Builder> a = stdlib::witness_t<Builder>(&function_circuit, 100);
//             stdlib::field_t<Builder> b = stdlib::witness_t<Builder>(&function_circuit, 10);
//             stdlib::field_t<Builder> d = stdlib::witness_t<Builder>(&function_circuit, 110);
//             auto c = a + b;
//             c.assert_eq(d)
//         }
//     }
//     /**
//      * @brief Perform a specified number of function circuit accumulation rounds
//      * @details Each round "accumulates" a mock function circuit and a mock kernel circuit. Each round thus consists
//      of
//      * the generation of two circuits, two folding proofs and two Merge proofs. To match the sizes called out in the
//      * spec
//      * (https://github.com/AztecProtocol/aztec-packages/blob/master/yellow-paper/docs/cryptography/performance-targets.md)
//      * we set the size of the function circuit to be 2^17. The first one should be 2^19 but we can't currently
//      support
//      * folding circuits of unequal size.
//      *
//      */
//     static void perform_ivc_accumulation_rounds(State& state, ClientIVC& ivc)
//     {
//         const size_t size_hint = 1 << 15; // Size hint for reserving wires/selector vector memory in builders
//         std::vector<Builder> initial_function_circuits(2);

//         // Construct 2 starting function circuits in parallel
//         {
//             BB_OP_COUNT_TIME_NAME("construct_circuits");
//             parallel_for(2, [&](size_t circuit_index) {
//                 GoblinMockCircuits::construct_mock_function_circuit(initial_function_circuits[circuit_index]);
//             });
//         };

//         // Prepend queue to the first circuit
//         initial_function_circuits[0].op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
//         // Initialize ivc
//         ivc.initialize(initial_function_circuits[0]);
//         // Retrieve the queue
//         std::swap(*ivc.goblin.op_queue, *initial_function_circuits[0].op_queue);

//         // Prepend queue to the second circuit
//         initial_function_circuits[1].op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
//         // Accumulate another function circuit
//         auto function_fold_proof = ivc.accumulate(initial_function_circuits[1]);
//         // Retrieve the queue
//         std::swap(*ivc.goblin.op_queue, *initial_function_circuits[1].op_queue);
//         VerifierFoldData function_fold_output = { function_fold_proof, ivc.vks.func_vk };

//         // Free memory
//         initial_function_circuits.clear();

//         auto NUM_CIRCUITS = static_cast<size_t>(state.range(0));
//         // Subtract two to account for the "initialization" round above i.e. we have already folded two function
//         // circuits
//         NUM_CIRCUITS -= 2;

//         // The accumulator for kernel uses the function accumulation verification key
//         auto kernel_verifier_accumulator = std::make_shared<ClientIVC::VerifierInstance>(ivc.vks.first_func_vk);

//         VerifierFoldData kernel_fold_output;
//         for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
//             Builder kernel_circuit{ size_hint, ivc.goblin.op_queue };
//             Builder function_circuit{ size_hint };
//             // Construct function and kernel circuits in parallel
//             {
//                 BB_OP_COUNT_TIME_NAME("construct_circuits");
//                 for (size_t workload_idx = 0; workload_idx < 2; ++workload_idx) {
//                     // workload index is 0 for kernel and 1 for function
//                     if (workload_idx == 0) {
//                         if (circuit_idx == 0) {

//                             // Create the first folding kernel which only verifies the accumulation of a
//                             // function circuit
//                             kernel_verifier_accumulator = GoblinMockCircuits::construct_mock_folding_kernel(
//                                 kernel_circuit, function_fold_output, {}, kernel_verifier_accumulator);
//                         } else {
//                             // Create kernel circuit containing the recursive folding verification of a function
//                             circuit
//                             // and a kernel circuit
//                             kernel_verifier_accumulator = GoblinMockCircuits::construct_mock_folding_kernel(
//                                 kernel_circuit, function_fold_output, kernel_fold_output,
//                                 kernel_verifier_accumulator);
//                         }
//                     } else {
//                         state.PauseTiming();
//                         GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
//                         state.ResumeTiming();
//                     }
//                 }
//             };

//             // No need to prepend queue, it's the same after last swap
//             // Accumulate kernel circuit
//             auto kernel_fold_proof = ivc.accumulate(kernel_circuit);

//             // First iteration and the following ones differ
//             if (circuit_idx == 0) {
//                 kernel_fold_output = { kernel_fold_proof, ivc.vks.first_kernel_vk };
//             } else {
//                 kernel_fold_output = { kernel_fold_proof, ivc.vks.kernel_vk };
//             }

//             // Prepend queue to function circuit
//             function_circuit.op_queue->prepend_previous_queue(*ivc.goblin.op_queue);

//             // Accumulate function circuit
//             auto function_fold_proof = ivc.accumulate(function_circuit);
//             function_fold_output = { function_fold_proof, ivc.vks.func_vk };

//             // Retrieve queue
//             std::swap(*ivc.goblin.op_queue, *function_circuit.op_queue);
//         }
//         // If we haven't entered the cycle, the kernel proof accumulates just function proofs
//         if (NUM_CIRCUITS == 0) {
//             // Create and accumulate the first folding kernel which only verifies the accumulation of a function
//             circuit Builder kernel_circuit{ size_hint, ivc.goblin.op_queue }; auto kernel_verifier_accumulator =
//             std::make_shared<ClientIVC::VerifierInstance>(ivc.vks.first_func_vk);
//             {
//                 BB_OP_COUNT_TIME_NAME("construct_circuits");
//                 kernel_verifier_accumulator = GoblinMockCircuits::construct_mock_kernel_small(
//                     kernel_circuit,
//                     { function_fold_output.fold_proof, function_fold_output.inst_vk },
//                     { kernel_verifier_accumulator->});
//             }
//             auto kernel_fold_proof = ivc.accumulate(kernel_circuit);
//             kernel_fold_output = { kernel_fold_proof, ivc.vks.first_kernel_vk };
//         } else {
//             Builder kernel_circuit{ size_hint, ivc.goblin.op_queue };
//             {
//                 BB_OP_COUNT_TIME_NAME("construct_circuits");
//                 kernel_verifier_accumulator = GoblinMockCircuits::construct_mock_kernel_small(
//                     kernel_circuit, function_fold_output, kernel_verifier_accumulator);
//             }

//             auto kernel_fold_proof = ivc.accumulate(kernel_circuit);
//             kernel_fold_output = { kernel_fold_proof, ivc.vks.kernel_vk };
//         }
//     }
// };

// /**
//  * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
//  *
//  */
// BENCHMARK_DEFINE_F(RawIVCBench, Full)(benchmark::State& state)
// {
//     ClientIVC ivc;
//     ivc.precompute_folding_verification_keys();
//     for (auto _ : state) {
//         BB_REPORT_OP_COUNT_IN_BENCH(state);
//         // Perform a specified number of iterations of function/kernel accumulation
//         perform_ivc_accumulation_rounds(state, ivc);

//         // Construct IVC scheme proof (fold, decider, merge, eccvm, translator)
//         ivc.prove();
//     }
// }

// /**
//  * @brief Benchmark only the accumulation rounds
//  *
//  */
// BENCHMARK_DEFINE_F(RawIVCBench, Accumulate)(benchmark::State& state)
// {
//     ClientIVC ivc;
//     ivc.precompute_folding_verification_keys();
//     // Perform a specified number of iterations of function/kernel accumulation
//     for (auto _ : state) {
//         BB_REPORT_OP_COUNT_IN_BENCH(state);
//         perform_ivc_accumulation_rounds(state, ivc);
//     }
// }

// /**
//  * @brief Benchmark only the Decider component
//  *
//  */
// BENCHMARK_DEFINE_F(RawIVCBench, Decide)(benchmark::State& state)
// {
//     ClientIVC ivc;
//     // Perform a specified number of iterations of function/kernel accumulation
//     perform_ivc_accumulation_rounds(state, ivc);

//     // Construct eccvm proof, measure only translator proof construction
//     for (auto _ : state) {
//         BB_REPORT_OP_COUNT_IN_BENCH(state);
//         ivc.decider_prove();
//     }
// }

// /**
//  * @brief Benchmark only the ECCVM component
//  *
//  */
// BENCHMARK_DEFINE_F(RawIVCBench, ECCVM)(benchmark::State& state)
// {
//     ClientIVC ivc;

//     // Perform a specified number of iterations of function/kernel accumulation
//     perform_ivc_accumulation_rounds(state, ivc);

//     // Construct and measure eccvm only
//     for (auto _ : state) {
//         BB_REPORT_OP_COUNT_IN_BENCH(state);
//         ivc.goblin.prove_eccvm();
//     }
// }

// /**
//  * @brief Benchmark only the Translator component
//  *
//  */
// BENCHMARK_DEFINE_F(RawIVCBench, Translator)(benchmark::State& state)
// {
//     ClientIVC ivc;
//     ivc.precompute_folding_verification_keys();
//     BB_REPORT_OP_COUNT_IN_BENCH(state);
//     // Perform a specified number of iterations of function/kernel accumulation
//     perform_ivc_accumulation_rounds(state, ivc);

//     // Construct eccvm proof, measure only translator proof construction
//     ivc.goblin.prove_eccvm();
//     for (auto _ : state) {
//         ivc.goblin.prove_translator();
//     }
// }

// #define ARGS                                                                                                           \
//     Arg(RawIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)                                                                 \
//         ->Arg(1 << 1)                                                                                                  \
//         ->Arg(1 << 2)                                                                                                  \
//         ->Arg(1 << 3)                                                                                                  \
//         ->Arg(1 << 4)                                                                                                  \
//         ->Arg(1 << 5)                                                                                                  \
//         ->Arg(1 << 6)

// BENCHMARK_REGISTER_F(RawIVCBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(RawIVCBench, Accumulate)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(RawIVCBench, Decide)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(RawIVCBench, ECCVM)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(RawIVCBench, Translator)->Unit(benchmark::kMillisecond)->ARGS;

// } // namespace

// BENCHMARK_MAIN();
