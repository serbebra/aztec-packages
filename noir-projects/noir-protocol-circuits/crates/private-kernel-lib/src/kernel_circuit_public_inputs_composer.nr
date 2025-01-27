use dep::types::{
    abis::{
    private_kernel_data::PrivateKernelData,
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, PrivateKernelCircuitPublicInputsBuilder, PublicKernelCircuitPublicInputs},
    note_hash::ScopedNoteHash, nullifier::ScopedNullifier, side_effect::Ordered,
    log_hash::{NoteLogHash, ScopedLogHash, ScopedEncryptedLogHash}, gas::Gas
},
    constants::{
    MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_NULLIFIERS_PER_TX, MAX_ENCRYPTED_LOGS_PER_TX,
    MAX_UNENCRYPTED_LOGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX
},
    hash::{
    compute_l2_to_l1_hash, compute_note_hash_nonce, compute_unique_note_hash, silo_note_hash,
    silo_nullifier, silo_encrypted_log, silo_unencrypted_log
},
    utils::arrays::{array_length, array_to_bounded_vec, assert_sorted_array}
};

fn asc_sort_by_counters<T>(a: T, b: T) -> bool where T: Ordered {
    a.counter() < b.counter()
}

// Builds:
// .finish -> KernelCircuitPublicInputs (from PrivateKernelTailCircuitPrivateInputs)
// .finish_to_public -> PublicKernelCircuitPublicInputs (from PrivateKernelTailToPublicCircuitPrivateInputs)
struct KernelCircuitPublicInputsComposer {
    public_inputs: PrivateKernelCircuitPublicInputsBuilder,
    previous_kernel: PrivateKernelData,
    // Hints
    sorted_note_hashes: [ScopedNoteHash; MAX_NEW_NOTE_HASHES_PER_TX],
    sorted_note_hashes_indexes: [u64; MAX_NEW_NOTE_HASHES_PER_TX],
    sorted_nullifiers: [ScopedNullifier; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_nullifiers_indexes: [u64; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_note_encrypted_log_hashes: [NoteLogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_note_encrypted_log_hashes_indexes: [u64; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hashes: [ScopedEncryptedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_encrypted_log_hashes_indexes: [u64; MAX_ENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
    sorted_unencrypted_log_hashes_indexes: [u64; MAX_UNENCRYPTED_LOGS_PER_TX],
}

impl KernelCircuitPublicInputsComposer {
    pub fn new(
        previous_kernel: PrivateKernelData,
        sorted_note_hashes: [ScopedNoteHash; MAX_NEW_NOTE_HASHES_PER_TX],
        sorted_note_hashes_indexes: [u64; MAX_NEW_NOTE_HASHES_PER_TX],
        sorted_nullifiers: [ScopedNullifier; MAX_NEW_NULLIFIERS_PER_TX],
        sorted_nullifiers_indexes: [u64; MAX_NEW_NULLIFIERS_PER_TX],
        sorted_note_encrypted_log_hashes: [NoteLogHash; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
        sorted_note_encrypted_log_hashes_indexes: [u64; MAX_NOTE_ENCRYPTED_LOGS_PER_TX],
        sorted_encrypted_log_hashes: [ScopedEncryptedLogHash; MAX_ENCRYPTED_LOGS_PER_TX],
        sorted_encrypted_log_hashes_indexes: [u64; MAX_ENCRYPTED_LOGS_PER_TX],
        sorted_unencrypted_log_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
        sorted_unencrypted_log_hashes_indexes: [u64; MAX_UNENCRYPTED_LOGS_PER_TX]
    ) -> Self {
        let public_inputs = PrivateKernelCircuitPublicInputsBuilder::empty();

        KernelCircuitPublicInputsComposer {
            public_inputs,
            previous_kernel,
            sorted_note_hashes,
            sorted_note_hashes_indexes,
            sorted_nullifiers,
            sorted_nullifiers_indexes,
            sorted_note_encrypted_log_hashes,
            sorted_note_encrypted_log_hashes_indexes,
            sorted_encrypted_log_hashes,
            sorted_encrypted_log_hashes_indexes,
            sorted_unencrypted_log_hashes,
            sorted_unencrypted_log_hashes_indexes
        }
    }

    pub fn compose(&mut self) -> Self {
        assert_eq(
            array_length(self.previous_kernel.public_inputs.end.private_call_stack), 0, "Private call stack must be empty when executing the tail circuit"
        );
        self.verify_empty_validation_requests();

        self.propagate_rollup_validation_requests();

        self.propagate_constant_data();

        self.propagate_sorted_arrays();

        self.propagate_fee_payer();

        self.verify_no_transient_data();

        self.silo_values();

        *self
    }

    pub fn compose_public(&mut self) -> Self {
        let _ = self.compose();

        self.propagate_sorted_public_call_requests();
        self.propagate_public_teardown_call_request();

        *self
    }

    pub fn finish(self) -> KernelCircuitPublicInputs {
        let teardown_gas = self.previous_kernel.public_inputs.constants.tx_context.gas_settings.teardown_gas_limits;
        let inputs = self.public_inputs.finish_tail(teardown_gas);
        let limits = self.previous_kernel.public_inputs.constants.tx_context.gas_settings.gas_limits;
        assert(inputs.end.gas_used.within(limits), "The gas used exceeds the gas limits");
        inputs
    }

    pub fn finish_to_public(self) -> PublicKernelCircuitPublicInputs {
        let min_revertible_side_effect_counter = self.previous_kernel.public_inputs.min_revertible_side_effect_counter;
        let teardown_gas = self.previous_kernel.public_inputs.constants.tx_context.gas_settings.teardown_gas_limits;
        let inputs = self.public_inputs.finish_to_public(teardown_gas, min_revertible_side_effect_counter);
        let limits = self.previous_kernel.public_inputs.constants.tx_context.gas_settings.gas_limits;
        let total_gas_used = inputs.end.gas_used + inputs.end_non_revertible.gas_used;
        assert(total_gas_used.within(limits), "The gas used exceeds the gas limits");
        inputs
    }

    fn silo_values(&mut self) {
        self.silo_note_hashes();
        self.silo_nullifiers();
        self.silo_l2_to_l1_messages();
        self.silo_encrypted_logs();
        self.silo_unencrypted_logs();
    }

    fn silo_note_hashes(&mut self) {
        let first_nullifier = self.public_inputs.end.new_nullifiers.get_unchecked(0).value();

        // This check is unnecessary. The 0th nullifier will always be set a non-zero value in private_kernel_init.
        // assert(first_nullifier != 0, "The 0th nullifier in the accumulated nullifier array is zero");

        let note_hashes = self.public_inputs.end.new_note_hashes.storage;
        for i in 0..MAX_NEW_NOTE_HASHES_PER_TX {
            let note_hash = note_hashes[i];
            if note_hash.value() != 0 {
                let nonce = compute_note_hash_nonce(first_nullifier, i);
                let unique_note_hash = compute_unique_note_hash(nonce, note_hash.value());
                let siloed = silo_note_hash(note_hash.contract_address, unique_note_hash);
                self.public_inputs.end.new_note_hashes.storage[i].note_hash.value = siloed;
            }
        }
    }

    fn silo_nullifiers(&mut self) {
        let nullifiers = self.public_inputs.end.new_nullifiers.storage;
        for i in 1..MAX_NEW_NOTE_HASHES_PER_TX { // i starts from 1 to skip the first nullifier.
            let nullifier = nullifiers[i];
            if nullifier.value() != 0 {
                let siloed = silo_nullifier(nullifier.contract_address, nullifier.value());
                self.public_inputs.end.new_nullifiers.storage[i].nullifier.value = siloed;
            }
        }
    }

    fn silo_l2_to_l1_messages(&mut self) {
        let l2_to_l1_msgs = self.public_inputs.end.new_l2_to_l1_msgs.storage;
        let tx_context = self.previous_kernel.public_inputs.constants.tx_context;
        for i in 0..l2_to_l1_msgs.len() {
            let msg = l2_to_l1_msgs[i];
            if !msg.contract_address.is_zero() {
                let siloed = compute_l2_to_l1_hash(
                    msg.contract_address,
                    tx_context.version,
                    tx_context.chain_id,
                    msg.message
                );
                self.public_inputs.end.new_l2_to_l1_msgs.storage[i].message.content = siloed;
            }
        }
    }

    fn silo_encrypted_logs(&mut self) {
        let logs = self.public_inputs.end.encrypted_logs_hashes.storage;
        for i in 0..logs.len() {
            let log = logs[i];
            if log.value() != 0 {
                let siloed = silo_encrypted_log(log.contract_address, log.log_hash.randomness, log.value());
                self.public_inputs.end.encrypted_logs_hashes.storage[i].log_hash.value = siloed;
            }
        }
    }

    fn silo_unencrypted_logs(&mut self) {
        let logs = self.public_inputs.end.unencrypted_logs_hashes.storage;
        for i in 0..logs.len() {
            let log = logs[i];
            if log.value() != 0 {
                let siloed = silo_unencrypted_log(log.contract_address, log.value());
                self.public_inputs.end.unencrypted_logs_hashes.storage[i].log_hash.value = siloed;
            }
        }
    }

    fn propagate_rollup_validation_requests(&mut self) {
        self.public_inputs.validation_requests.max_block_number = self.previous_kernel.public_inputs.validation_requests.for_rollup.max_block_number;
    }

    fn propagate_constant_data(&mut self) {
        self.public_inputs.constants = self.previous_kernel.public_inputs.constants;
    }

    fn propagate_sorted_arrays(&mut self) {
        let accumulated_data = self.previous_kernel.public_inputs.end;

        assert_sorted_array(
            accumulated_data.new_note_hashes,
            self.sorted_note_hashes,
            self.sorted_note_hashes_indexes,
            asc_sort_by_counters
        );
        self.public_inputs.end.new_note_hashes = array_to_bounded_vec(self.sorted_note_hashes);

        assert_sorted_array(
            accumulated_data.new_nullifiers,
            self.sorted_nullifiers,
            self.sorted_nullifiers_indexes,
            asc_sort_by_counters
        );
        self.public_inputs.end.new_nullifiers = array_to_bounded_vec(self.sorted_nullifiers);

        assert_sorted_array(
            accumulated_data.note_encrypted_logs_hashes,
            self.sorted_note_encrypted_log_hashes,
            self.sorted_note_encrypted_log_hashes_indexes,
            asc_sort_by_counters
        );
        self.public_inputs.end.note_encrypted_logs_hashes = array_to_bounded_vec(self.sorted_note_encrypted_log_hashes);

        assert_sorted_array(
            accumulated_data.encrypted_logs_hashes,
            self.sorted_encrypted_log_hashes,
            self.sorted_encrypted_log_hashes_indexes,
            asc_sort_by_counters
        );
        self.public_inputs.end.encrypted_logs_hashes = array_to_bounded_vec(self.sorted_encrypted_log_hashes);

        assert_sorted_array(
            accumulated_data.unencrypted_logs_hashes,
            self.sorted_unencrypted_log_hashes,
            self.sorted_unencrypted_log_hashes_indexes,
            asc_sort_by_counters
        );
        self.public_inputs.end.unencrypted_logs_hashes = array_to_bounded_vec(self.sorted_unencrypted_log_hashes);
        // TODO: Sort all the side effects below.
        self.public_inputs.end.new_l2_to_l1_msgs = array_to_bounded_vec(accumulated_data.new_l2_to_l1_msgs);
    }

    fn propagate_sorted_public_call_requests(&mut self) {
        let accumulated_data = self.previous_kernel.public_inputs.end;
        self.public_inputs.end.public_call_stack = array_to_bounded_vec(accumulated_data.public_call_stack);
    }

    fn propagate_public_teardown_call_request(&mut self) {
        self.public_inputs.public_teardown_call_request = self.previous_kernel.public_inputs.public_teardown_call_request;
    }

    fn propagate_fee_payer(&mut self) {
        self.public_inputs.fee_payer = self.previous_kernel.public_inputs.fee_payer;
    }

    fn verify_no_transient_data(self) {
        // Currently all the transient note hashes and nullifiers must be cleared in the reset circuits.
        // Check that the propagated note hashes don't link to a nullifier, and vice versa.
        for note_hash in self.public_inputs.end.new_note_hashes.storage {
            assert(note_hash.nullifier_counter == 0, "Unresolved transient note hash");
        }
        for new_nullifier in self.public_inputs.end.new_nullifiers.storage {
            assert(new_nullifier.nullified_note_hash() == 0, "Unresolved transient nullifier");
        }
    }

    fn verify_empty_validation_requests(self) {
        assert_eq(
            array_length(self.previous_kernel.public_inputs.validation_requests.note_hash_read_requests), 0, "Non empty note hash read requests"
        );

        assert_eq(
            array_length(self.previous_kernel.public_inputs.validation_requests.nullifier_read_requests), 0, "Non empty nullifier read requests"
        );

        assert_eq(
            array_length(
                self.previous_kernel.public_inputs.validation_requests.scoped_key_validation_requests_and_generators
            ), 0, "Non empty key validation requests"
        );
    }
}
