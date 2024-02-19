#include "barretenberg/dsl/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

// TODO: Ideally we can just put in a field element directly
// TODO: Then we would not need to marshall and unmarshall each time
struct FieldElement {
    std::vector<uint32_t> bytes;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(bytes);
    friend bool operator==(FieldElement const& lhs, FieldElement const& rhs) = default;
};

struct InitConstantLookup {
    std::vector<FieldElement> first_tuple_elements;
    std::vector<FieldElement> second_tuple_elements;
    std::vector<FieldElement> third_tuple_elements;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(first_tuple_elements, second_tuple_elements, third_tuple_elements);
    friend bool operator==(InitConstantLookup const& lhs, InitConstantLookup const& rhs) = default;
};

struct LookupOperation {
    // A map of the elements we want to lookup
    //
    // For looking up only the first element in the tuple
    // this value would be 1, because (0,0,1) maps to 1
    //
    // For looking up the last element, this value would be 4
    // because (1,0,0)  maps to 4 when you look at it in binary
    //
    // For looking up the first two elements, we would map
    // (0,1,1) to 2^2 * 0 + 2^1 * 1 + 2^0 * 1 = 3
    uint32_t elements_to_lookup;

    // These are the witnesses that we want to check are in the constant table
    // The elements_to_lookup value, indicates whiich elements we actually want to
    // check are in the table and which elements we want to omit
    uint32_t first_tuple_element;
    uint32_t second_tuple_element;
    uint32_t third_tuple_element;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(elements_to_lookup, first_tuple_element, second_tuple_element, third_tuple_element);
    friend bool operator==(LookupOperation const& lhs, LookupOperation const& rhs) = default;
};

} // namespace acir_format