use dep::aztec::prelude::{
    AztecAddress, NoteGetterOptions, NoteViewerOptions, NoteHeader, NoteInterface, PrivateContext,
    PrivateSet, Map
};
use dep::aztec::{
    context::{PublicContext, Context}, hash::pedersen_hash,
    protocol_types::constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    note::{note_getter::view_notes, note_getter_options::SortOrder},
    note::note_getter_options::{Comparator, PropertySelector},
    keys::getters::{get_npk_m_hash, get_ivpk_m}
};
use crate::types::token_note::{TokenNote, OwnedNote};
use dep::std::option::Option;

struct BalancesMap<T> {
    map: PrivateSet<T>,
    // Code smell. Why can't I constrain T
    // owner_selector: PropertySelector
}

impl<T> BalancesMap<T> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self { map: PrivateSet::new(context, storage_slot) }
    }

    unconstrained pub fn balance_of<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        self.balance_of_with_offset(owner, 0)
    }

    unconstrained pub fn balance_of_with_offset<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        offset: u32
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let mut balance = U128::from_integer(0);
        let mut options = NoteViewerOptions::new();
        let context = self.map.context.private.unwrap();
        let owner_npk_m_hash = get_npk_m_hash(context, owner);
        let opt_notes = self.map.view_notes(
            options.select(
                T::get_owner_selector(),
                owner_npk_m_hash,
                Option::some(Comparator.EQ)
            )
        );
        let len = opt_notes.len();
        for i in 0..len {
            if opt_notes[i].is_some() {
                balance = balance + opt_notes[i].unwrap_unchecked().get_amount();
            }
        }
        if (opt_notes[len - 1].is_some()) {
            balance = balance + self.balance_of_with_offset(owner, offset + opt_notes.len() as u32);
        }

        balance
    }

    pub fn add<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        addend: U128
    ) where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let context = self.map.context.private.unwrap();
        let owner_ivpk_m = get_ivpk_m(context, owner);

        // We fetch the nullifier public key hash from the registry / from our PXE
        let owner_npk_m_hash = get_npk_m_hash(context, owner);
        let mut addend_note = T::new(addend, owner_npk_m_hash);

        self.map.insert(&mut addend_note, true, owner_ivpk_m);
    }

    pub fn sub<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        subtrahend: U128
    ) where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        // docs:start:get_notes
        let mut options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend);
        let context = self.map.context.private.unwrap();
        let owner_npk_m_hash = get_npk_m_hash(context, owner);
        let maybe_notes = self.map.get_notes(
            options.select(
                T::get_owner_selector(),
                owner_npk_m_hash,
                Option::some(Comparator.EQ)
            )
        );
        // docs:end:get_notes

        let mut minuend: U128 = U128::from_integer(0);
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let note = maybe_notes[i].unwrap_unchecked();

                // Removes the note from the owner's set of notes.
                // This will call the the `compute_nullifer` function of the `token_note`
                // which require knowledge of the secret key (currently the users encryption key).
                // The contract logic must ensure that the spending key is used as well.
                // docs:start:remove
                self.map.remove(note);
                // docs:end:remove

                minuend = minuend + note.get_amount();
            }
        }

        // This is to provide a nicer error msg,
        // without it minuend-subtrahend would still catch it, but more generic error then.
        // without the == true, it includes 'minuend.ge(subtrahend)' as part of the error.
        assert(minuend >= subtrahend, "Balance too low");

        self.add(owner, minuend - subtrahend);
    }
}

pub fn filter_notes_min_sum<T, T_SERIALIZED_LEN>(
    notes: [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: U128
) -> [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = U128::from_integer(0);
    for i in 0..notes.len() {
        if notes[i].is_some() & sum < min_sum {
            let note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(note);
            sum = sum.add(note.get_amount());
        }
    }
    selected
}
