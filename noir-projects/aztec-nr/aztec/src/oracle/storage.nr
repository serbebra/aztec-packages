use dep::protocol_types::traits::{Deserialize, Serialize};

#[oracle(storageRead)]
fn storage_read_oracle<N>(_storage_slot: Field, _number_of_elements: Field) -> [Field; N] {}

unconstrained fn storage_read_oracle_wrapper<N>(_storage_slot: Field) -> [Field; N] {
    storage_read_oracle(_storage_slot, N)
}

pub fn storage_read<N>(storage_slot: Field) -> [Field; N] {
    storage_read_oracle_wrapper(storage_slot)
}

#[oracle(storageWrite)]
fn storage_write_oracle(_storage_slot: Field, _value: Field) -> Field {}

#[oracle(storageWrite)]
pub fn storage_writes<N>(_storage_slot: Field, _value: [Field; N]) -> [Field; N] {}

#[oracle(storageWrite)]
pub fn storage_write(_storage_slot: Field, _value: Field) -> Field {}

// unconstrained pub fn storage_write(storage_slot: Field, field: Field) {
//     let _hash = storage_write_oracle(storage_slot, field);
// }
