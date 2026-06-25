# Snowball Studio

Snowball Studio turns real Sui DeFi actions into on-chain receipt NFTs. Users connect a Sui wallet, pick a recipe, route SUI into a vault object, and mint a `RecipeReceipt` object whose generated artwork is derived from the exact transaction metadata.

## Live Devnet Deployment

- Network: Sui devnet
- Publish transaction: `6YsUWempmDp2r3VyRPb1shAKyYajCHfc24CnrhMGi4ZK`
- Package ID: `0x3ef1f29d9bea4e75fe7e7cf6059bf4a55cfc5ae48c4e403284122983fa9fb5c9`
- Shared Studio object: `0x935a9a9c1489e150826abb3d89e21d667651e0141ce29b417d21fb558533dd47`
- Explorer: https://suiexplorer.com/txblock/6YsUWempmDp2r3VyRPb1shAKyYajCHfc24CnrhMGi4ZK?network=devnet

## Live Mint Proof

- Mint transaction: `DWbAgkGQFaJEvEW4LziF29HhYJw9rMQWite42Y1ur5b7`
- Receipt object: `0x4ab7b20a842b00a69a04a2ab0465b23e9af85831da45a1eb9ce43cb30139df19`
- Vault object: `0xa28f45c1c5e3198b81a19a2db8d140d78b0694d32740fda4988f33eb45a280c5`
- Explorer: https://suiexplorer.com/txblock/DWbAgkGQFaJEvEW4LziF29HhYJw9rMQWite42Y1ur5b7?network=devnet

## Product Surface

- Real Move package with `Studio`, `PersonalVault`, `ClanVault`, and `RecipeReceipt` objects.
- `split_snowball` locks SUI in a personal vault and transfers a receipt NFT object to the signer.
- `create_clan_vault` and `contribute_to_clan` create shared, collaborative vault flows.
- React app uses Mysten dApp Kit and constructs live Sui transactions, not mocked chain state.
- NFT art is deterministic SVG generated from receipt traits: recipe type, amount, steps, vault percent, clan flag, guard flag, seed, and digest.
- Generated section artwork is used directly in the product page, with each section image and action strip linked to a live builder action or verified Sui devnet proof.
- After a successful mint, the app shows a transaction notification with links to inspect the transaction hash and jump to the generated NFT preview.

## Run

```bash
npm install
npm run dev
```

## Build Checks

```bash
npm run build
cd move
sui move build --build-env testnet
```

The devnet deployment was performed with:

```bash
cd move
sui client switch --env devnet
sui client test-publish --build-env testnet --gas-budget 1000000000 --json
```
