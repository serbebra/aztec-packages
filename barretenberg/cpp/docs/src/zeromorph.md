# Zeromorph
<!-- \tableofcontents -->
Zeromorph is a commitment scheme introduced in [KT] and desgined to commit multilinear polynomials using the hiding version of the univariate KZG scheme and to prove the evaluations of multilinear polynomials. The evaluation protocol is ZK.  

This spec described what is currently implemented in Barretenberg.

# Preliminaries

# Flavors

# Prover's algorithm


This is outlined in `proof_system::honk::pcs::zeromorph::ZeroMorphProver_::compute_multilinear_quotients`:
 \snippet cpp/src/barretenberg/commitment_schemes/zeromorph/zeromorph.hpp Compute quotients



# Verifier's algorithm