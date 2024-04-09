use dep::aztec::{
    context::{
    PrivateContext, Context, inputs::PrivateContextInputs,
    globals::private_global_variables::PrivateGlobalVariables
}
};
use dep::protocol_types::{
    address::{AztecAddress, EthAddress}, header::Header,
    abis::{function_selector::FunctionSelector, side_effect::SideEffect, call_context::CallContext}
};

use dep::authwit::{
    entrypoint::app::AppPayload, entrypoint::fee::FeePayload, entrypoint::function_call::FunctionCall,
    account::AccountActions
};

fn empty_function_call() -> FunctionCall {
    FunctionCall {
        args_hash: 0,
        function_selector: FunctionSelector { inner: 0 },
        target_address: AztecAddress { inner: 0 },
        is_public: false
    }
}

fn main() {
    let inputs = PrivateContextInputs {
        call_context: CallContext {
            msg_sender: AztecAddress::zero(),
            storage_contract_address: AztecAddress::zero(),
            portal_contract_address: EthAddress::zero(),
            function_selector: FunctionSelector { inner: 0x1234 },
            is_delegate_call: false,
            is_static_call: false,
            side_effect_counter: 5
        },
        historical_header: Header::empty(),
        private_global_variables: PrivateGlobalVariables { chain_id: 1000, version: 3 },
        start_side_effect_counter: 5
    };

    let mut private_context = PrivateContext::new(inputs, 0xcafe);

    let context = Context::private(&mut private_context);

    let fee_payload = FeePayload { function_calls: [empty_function_call(), empty_function_call()], nonce: 0 };

    let app_payload = AppPayload {
        function_calls: [empty_function_call(), empty_function_call(), empty_function_call(), empty_function_call()],
        nonce: 0
    };

    let actions = AccountActions::init(
        context,
        1,
        |ctx: &mut PrivateContext, _msg: Field| { 
        ctx.push_note_hash_read_request(0x060657913957bf5535951df734bc7886e9ccf62d9def3eb8c5c3d1196268773b);
        true
    }
    );

    println(private_context.note_hash_read_requests.storage.map(|x: SideEffect| x.value));

    actions.entrypoint(app_payload, fee_payload);

    println(private_context.note_hash_read_requests.storage.map(|x: SideEffect| x.value));

    assert(private_context.note_hash_read_requests.storage[3].value == 0);
}

#[test]
fn test_main() {
    main();
}
