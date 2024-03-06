contract ICEExample {
    use dep::aztec::prelude::{AztecAddress, NoteViewerOptions, PrivateSet};

    use dep::value_note::value_note::ValueNote;

    struct Storage {
        set: PrivateSet<ValueNote>,
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor() {}

    #[aztec(private)]
    fn ice_trigger() {
        let options = NoteViewerOptions::new();

        // Causes an ICE
        let _ = storage.set.view_notes(options);
        // This alternative function is the exact same, except unconstrained. No ICE.
        // let _ = storage.set.view_notes_constrained(options);
    }
}
