#pragma once

#include "barretenberg/vm/avm_trace/avm_trace.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"
#include <array>

#define EXPECT_THROW_WITH_MESSAGE(code, expectedMessage)                                                               \
    try {                                                                                                              \
        code;                                                                                                          \
        FAIL() << "An exception was expected";                                                                         \
    } catch (const std::exception& e) {                                                                                \
        std::string message = e.what();                                                                                \
        EXPECT_TRUE(message.find(expectedMessage) != std::string::npos);                                               \
    }
namespace tests_avm {

using Flavor = bb::AvmFlavor;
using FF = Flavor::FF;
using Row = bb::AvmFullRow<bb::fr>;
using ThreeOpParam = std::array<FF, 3>;
using ThreeOpParamRow = std::tuple<ThreeOpParam, bb::avm_trace::AvmMemoryTag>;

// To toggle all relevant unit tests with proving, set the env variable "AVM_TESTS_ENABLE_PROVING".
static const bool ENABLE_PROVING = std::getenv("AVM_TESTS_ENABLE_PROVING") != nullptr;

// If the test is expecting a relation to fail, then use validate_trace_check_circuit.
// Otherwise, use validate_trace with a single argument. If the proving needs to be
// enabled all the time in a given test, use validate_trace with setting with_proof = true.
void validate_trace_check_circuit(std::vector<Row>&& trace, std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs = {});
void validate_trace(std::vector<Row>&& trace,
                    std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs = {},
                    bool with_proof = ENABLE_PROVING);
void mutate_ic_in_trace(std::vector<Row>& trace,
                        std::function<bool(Row)>&& selectRow,
                        FF const& newValue,
                        bool alu = false);
void clear_range_check_counters(std::vector<Row>& trace, uint256_t previous_value);
void update_slice_registers(Row& row, uint256_t a);
std::vector<ThreeOpParamRow> gen_three_op_params(std::vector<std::array<FF, 3>> operands,
                                                 std::vector<bb::avm_trace::AvmMemoryTag> mem_tags);

} // namespace tests_avm
