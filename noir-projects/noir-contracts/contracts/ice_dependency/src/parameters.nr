struct Parameters<T, N> {
    values: BoundedVec<Option<T>, N>
}

impl<T, N> Parameters<T, N> {
    pub fn new() -> Self {
        Parameters {
            values: BoundedVec::new()
        }
    }
}