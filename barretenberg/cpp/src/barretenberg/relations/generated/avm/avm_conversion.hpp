
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Avm_vm {

template <typename FF> struct Avm_conversionRow {
    FF avm_conversion_to_radix_le_sel{};
};

inline std::string get_relation_label_avm_conversion(int index)
{
    switch (index) {}
    return std::to_string(index);
}

template <typename FF_> class avm_conversionImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 1> SUBRELATION_PARTIAL_LENGTHS{
        3,
    };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {

        // Contribution 0
        {
            Avm_DECLARE_VIEWS(0);

            auto tmp = (avm_conversion_to_radix_le_sel * (-avm_conversion_to_radix_le_sel + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
    }
};

template <typename FF> using avm_conversion = Relation<avm_conversionImpl<FF>>;

} // namespace bb::Avm_vm