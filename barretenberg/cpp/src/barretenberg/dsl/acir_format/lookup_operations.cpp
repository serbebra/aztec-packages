#include "lookup_operations.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace acir_format {
template <typename Builder> void create_lookup_table(Builder& builder, const InitConstantLookup& init_table)
{
    (void)builder;
    (void)init_table;
    // Create lookup table with constant value using stdlib
    //
    // Save ID for lookup table in some global state
    //
    // This should be all thats needed
}

template <typename Builder> void create_lookup_read(Builder& builder, const ConstLookupRead& read_operation)
{
    (void)builder;
    (void)read_operation;
    // Take the ID from the global state to get what lookup table we need to read
    //
    // Perform a lookup read from the BasicTable
}

template void create_lookup_table<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                       const InitConstantLookup& init_table);

template void create_lookup_table<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                             const InitConstantLookup& init_table);

template void create_lookup_read<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                      const ConstLookupRead& read_operation);

template void create_lookup_read<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                            const ConstLookupRead& read_operation);
} // namespace acir_format