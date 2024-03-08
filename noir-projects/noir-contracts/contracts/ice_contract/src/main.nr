contract ICEExample {
    use dep::aztec::prelude::AztecAddress;
    use dep::ice_dependency::{Struct, parameters::Parameters};


    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor() {}

    #[aztec(private)]
    fn ice_trigger() {
        let ztruct: Struct<Field> = Struct{};
        let parameters = Parameters::new();

        // Causes an ICE
        let _ = ztruct.view_notes(parameters);
    }
}
