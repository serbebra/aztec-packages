mod parameters;

use crate::parameters::Parameters;

struct Struct<T> {}

impl<T> Struct<T> {
    unconstrained pub fn view_notes<N>(
        self,
        parameters: Parameters<T, N>,
    ) -> [Option<T>; 5]{
        [Option::none(); 5]
    }

    pub fn view_notes_constrained<N>(
        self,
        parameters: Parameters<T, N>,
    ) -> [Option<T>; 5] {
        [Option::none(); 5]
    }
}