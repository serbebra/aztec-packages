#pragma once
#include "aztec_constants.hpp"
#include <cstdint>

// NOTE(MD): for now we will only include the public inputs that are included in call_context
// With more being added in subsequent prs
// KERNEL_INPUTS_LENGTH = CALL_CONTEXT_LENGTH +
inline const std::size_t KERNEL_INPUTS_LENGTH = PUBLIC_CONTEXT_INPUTS_LENGTH;

// L2 and Da gas left are the 3rd last and 2nd last items in the context kernel inputs respectively
inline const std::size_t L2_GAS_LEFT_CONTEXT_INPUTS_OFFSET = KERNEL_INPUTS_LENGTH - 3;
inline const std::size_t DA_GAS_LEFT_CONTEXT_INPUTS_OFFSET = KERNEL_INPUTS_LENGTH - 2;