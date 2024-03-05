// A contract used along with `Parent` contract to test nested calls.
contract DelegatedOn {
    use dep::std::option::Option;

    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context}, log::emit_unencrypted_log,
        state_vars::{PublicMutable, PrivateSet},
        protocol_types::{abis::{function_selector::FunctionSelector, call_context::CallContext}, address::AztecAddress},
        note::{
        note_getter_options::NoteGetterOptions, note_viewer_options::NoteViewerOptions,
        utils as note_utils, note_header::NoteHeader
    }
    };
    use dep::value_note::value_note::ValueNote;

    struct Storage {
        current_value: PublicMutable<Field>,
        a_private_value: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn private_set_value(new_value: Field, owner: AztecAddress) -> Field {
        let mut note = ValueNote::new(new_value, owner);
        storage.a_private_value.insert(&mut note, true);
        new_value
    }

    #[aztec(public)]
    fn public_set_value(new_value: Field) -> Field {
        storage.current_value.write(new_value);
        new_value
    }

    unconstrained fn view_private_value(amount: Field, owner: AztecAddress) -> pub Field {
        let options = NoteViewerOptions::new().select(ValueNote::fields().value, amount, Option::none()).select(ValueNote::fields().owner, owner.to_field(), Option::none()).set_limit(1);
        let notes = storage.a_private_value.view_notes(options);
        notes[0].unwrap_unchecked().value
    }

    unconstrained fn view_public_value() -> pub Field {
        storage.current_value.read()
    }
}

