module snowball_studio::snowball_studio;

use std::string::String;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;

const E_NOT_OWNER: u64 = 1;
const E_BAD_PERCENT: u64 = 2;
const E_EMPTY_PAYMENT: u64 = 3;

public struct Studio has key {
    id: UID,
    total_receipts: u64,
    clan_vaults: u64,
}

public struct PersonalVault has key, store {
    id: UID,
    owner: address,
    label: String,
    balance: Balance<SUI>,
    guard_enabled: bool,
    created_ms: u64,
}

public struct ClanVault has key {
    id: UID,
    creator: address,
    label: String,
    balance: Balance<SUI>,
    contributors: u64,
    target_mist: u64,
    created_ms: u64,
}

public struct RecipeReceipt has key, store {
    id: UID,
    owner: address,
    title: String,
    recipe_type: u8,
    steps: u8,
    vault_percent: u8,
    clan_enabled: bool,
    guard_enabled: bool,
    amount_mist: u64,
    vault_object: address,
    clan_object: address,
    nonce: u64,
    created_ms: u64,
    art_seed: vector<u8>,
}

public struct ReceiptMinted has copy, drop {
    receipt_id: address,
    owner: address,
    recipe_type: u8,
    amount_mist: u64,
    steps: u8,
}

public struct ClanContribution has copy, drop {
    clan_id: address,
    contributor: address,
    amount_mist: u64,
    contributors: u64,
}

fun init(ctx: &mut TxContext) {
    let studio = Studio {
        id: object::new(ctx),
        total_receipts: 0,
        clan_vaults: 0,
    };
    transfer::share_object(studio);
}

entry fun split_snowball(
    studio: &mut Studio,
    clock: &Clock,
    mut payment: Coin<SUI>,
    title: String,
    recipe_type: u8,
    steps: u8,
    vault_percent: u8,
    clan_enabled: bool,
    guard_enabled: bool,
    art_seed: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(vault_percent <= 100, E_BAD_PERCENT);

    let owner = tx_context::sender(ctx);
    let amount_mist = coin::value(&payment);
    assert!(amount_mist > 0, E_EMPTY_PAYMENT);

    let vault_amount = (amount_mist * (vault_percent as u64)) / 100;
    let vault_balance = if (vault_amount > 0) {
        let vault_coin = coin::split(&mut payment, vault_amount, ctx);
        coin::into_balance(vault_coin)
    } else {
        balance::zero()
    };

    let vault = PersonalVault {
        id: object::new(ctx),
        owner,
        label: title,
        balance: vault_balance,
        guard_enabled,
        created_ms: clock.timestamp_ms(),
    };
    let vault_object = object::uid_to_address(&vault.id);

    if (coin::value(&payment) > 0) {
        transfer::public_transfer(payment, owner);
    } else {
        coin::destroy_zero(payment);
    };

    studio.total_receipts = studio.total_receipts + 1;
    let receipt = RecipeReceipt {
        id: object::new(ctx),
        owner,
        title,
        recipe_type,
        steps,
        vault_percent,
        clan_enabled,
        guard_enabled,
        amount_mist,
        vault_object,
        clan_object: @0x0,
        nonce: studio.total_receipts,
        created_ms: clock.timestamp_ms(),
        art_seed,
    };
    let receipt_id = object::uid_to_address(&receipt.id);

    transfer::public_transfer(vault, owner);
    transfer::public_transfer(receipt, owner);
    event::emit(ReceiptMinted {
        receipt_id,
        owner,
        recipe_type,
        amount_mist,
        steps,
    });
}

entry fun create_clan_vault(
    studio: &mut Studio,
    clock: &Clock,
    payment: Coin<SUI>,
    label: String,
    target_mist: u64,
    ctx: &mut TxContext,
) {
    let creator = tx_context::sender(ctx);
    let amount_mist = coin::value(&payment);
    assert!(amount_mist > 0, E_EMPTY_PAYMENT);

    let clan = ClanVault {
        id: object::new(ctx),
        creator,
        label,
        balance: coin::into_balance(payment),
        contributors: 1,
        target_mist,
        created_ms: clock.timestamp_ms(),
    };
    let clan_id = object::uid_to_address(&clan.id);
    studio.clan_vaults = studio.clan_vaults + 1;

    event::emit(ClanContribution {
        clan_id,
        contributor: creator,
        amount_mist,
        contributors: 1,
    });
    transfer::share_object(clan);
}

entry fun contribute_to_clan(
    clan: &mut ClanVault,
    payment: Coin<SUI>,
    ctx: &TxContext,
) {
    let contributor = tx_context::sender(ctx);
    let amount_mist = coin::value(&payment);
    assert!(amount_mist > 0, E_EMPTY_PAYMENT);

    balance::join(&mut clan.balance, coin::into_balance(payment));
    clan.contributors = clan.contributors + 1;

    event::emit(ClanContribution {
        clan_id: object::uid_to_address(&clan.id),
        contributor,
        amount_mist,
        contributors: clan.contributors,
    });
}

entry fun withdraw_personal_vault(vault: PersonalVault, ctx: &mut TxContext) {
    let PersonalVault {
        id,
        owner,
        label: _,
        balance,
        guard_enabled: _,
        created_ms: _,
    } = vault;
    assert!(tx_context::sender(ctx) == owner, E_NOT_OWNER);

    object::delete(id);
    let coin = coin::from_balance(balance, ctx);
    transfer::public_transfer(coin, owner);
}

public fun receipt_summary(receipt: &RecipeReceipt): (address, u8, u8, u8, bool, bool, u64, u64) {
    (
        receipt.owner,
        receipt.recipe_type,
        receipt.steps,
        receipt.vault_percent,
        receipt.clan_enabled,
        receipt.guard_enabled,
        receipt.amount_mist,
        receipt.nonce,
    )
}
