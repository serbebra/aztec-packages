#pragma once
#include <barretenberg/dsl/acir_format/acir_format.hpp>
#include <barretenberg/goblin/goblin.hpp>

namespace acir_proofs {

/**
 * @brief A class responsible for marshalling construction of keys and prover and verifier instances used to prove
 * satisfiability of circuits written in ACIR.
 *
 */
class GoblinAcirComposer {

    using WitnessVector = std::vector<fr, ContainerSlabAllocator<fr>>;

  public:
    GoblinAcirComposer() = default;

    /**
     * @brief Create a MegaHonk circuit from an acir constraint system and a witness
     *
     * @param constraint_system ACIR representation of the constraints defining the circuit
     * @param witness The witness values known to ACIR during construction of the constraint system
     */
    void create_circuit(acir_format::AcirFormat& constraint_system, acir_format::WitnessVector& witness);

    /**
     * @brief Accumulate a final circuit and construct a full Goblin proof
     * @details Accumulation means constructing a MegaHonk proof of a single (final) circuit. A full Goblin proof
     * consists of a merge proof, an ECCVM proof and a Translator proof. The Goblin proof is only constructed at the end
     * of the accumulation phase and establishes the correctness of the ECC operations written to the op queue
     * throughout the accumulation phase.
     *
     */
    std::vector<bb::fr> accumulate_and_prove();

    /**
     * @brief Verify the final MegaHonk proof and the full Goblin proof
     *
     * @return bool verified
     */
    bool verify(std::vector<bb::fr> const& proof);

  private:
    acir_format::GoblinBuilder builder_;
    Goblin goblin;
    bool verbose_ = true;

    template <typename... Args> inline void vinfo(Args... args)
    {
        if (verbose_) {
            info(args...);
        }
    }
};

} // namespace acir_proofs
