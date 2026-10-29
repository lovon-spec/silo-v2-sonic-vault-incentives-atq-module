# Legacy Silo vault incentives modules on Sonic

This module emits the separately deployed incentives modules associated with legacy Silo managed ERC-4626 vaults on Sonic, chain146. It emits the module contracts, distinct from their vaults, share tokens and lending-market contracts.

## Specific source documentation

Silo Finance's own [snapshot documentation](https://github.com/silo-finance/lenders-snapshot/blob/58dbfc612906307137c305d56adf9f1a7ea61dce/scripts/lender-snapshot/README.md)
describes the `subgraph_url` configuration and identifies `snapshot_lenders.py`
as its canonical configuration. That [documented configuration](https://github.com/silo-finance/lenders-snapshot/blob/58dbfc612906307137c305d56adf9f1a7ea61dce/scripts/lender-snapshot/snapshot_lenders.py)
explicitly selects Sonic's subgraph
`8wcbzcdNirQvk1ETh25wpVzb5GWs8DvugpbwrYnTCcxj`. This is a reference to that
specific subgraph, without inferring authorization for other publications by
the same address. The project also identifies these chain endpoints as legacy
V2 sources in its [borrower tooling](https://github.com/silo-finance/actions/blob/0e0a4f79772a176846e181483d1f22adf5b26948/scripts/pull_borrowers/fetch_legacy_borrowers.py).

The [named subgraph](https://thegraph.com/explorer/subgraphs/8wcbzcdNirQvk1ETh25wpVzb5GWs8DvugpbwrYnTCcxj?chain=arbitrum-one&view=About)
resolved on 2026-10-28 to deployment
`QmQUcPAEpUQJL3AYK21hsgNnj6XmWepTXJXySHdFXMmp7p`. The module queries that
explicit deployment through The Graph gateway, with the supplied key only in
the authorization header. Recheck the named source before filing an item.

The contract category is described by the project's [VaultIncentivesModule interface](https://github.com/silo-finance/silo-contracts-v3/blob/3db357d671e7fd3a6e591834e1d5b5054e950bb0/silo-vaults/contracts/interfaces/IVaultIncentivesModule.sol). The parent vault exposes INCENTIVES_MODULE and the module exposes vault. Production vault factories are listed in the [official deployment history](https://github.com/silo-finance/silo-contracts-v3/blob/ed18f3a33be1a08e786279c50b914b1d6eaf04c7/silo-core/docs/DeployedSiloVersions.md).

## Retrieval and names

Every VaultIncentivesModule row is retrieved at one pinned block hash through an unfiltered first page and complete ascending unique-address-ID cursor pagination, followed by a metadata seal. Errors, unhealthy metadata, invalid identities and unfinished pagination throw. A page budget throws instead of returning a partial set. No row is filtered out.

Names identify the official VaultIncentivesModule contract class and a visibly abbreviated dynamic module address. Notes retain the complete parent vault name, role and project associations as described below. Every source row is retained; an identity collision or unsafe nonempty parent name holds the whole result. The protocol UI link identifies the contract system without endorsing a permissionless manager.

Use Yarn and yarn build. All logic is in src/main.mts, exporting only async returnTags with two string arguments. MIT licensed, derived from our own original module.

Each query, including pacing and the response-body read, has a 30-second deadline. The complete run has a ten-minute deadline. A deadline throws without returning a partial set; native fetch cancellation is requested, and the local race also bounds fetch implementations that ignore cancellation. Use yarn build and yarn test.


Associated-project metadata is driven by each returned Graph parent vault name. Notes retain the complete source name and explicitly name Silo Finance. Five official product-name aliases also identify managers that do not appear in those names: Yield Optimized Sonic/USDC → Goat; Mithras → Travee; ABRC → YieldFi; Mainstreet Liquidity Vault → Braindead. These aliases contain no contract addresses and neither add nor filter returned entries. Their official Silo application sources are the same public configuration and manager-label metadata documented below.

Public names use the exact official Solidity class VaultIncentivesModule plus an abbreviated dynamic module address. The full parent vault name remains in Public Note; unknown or unsafe nonempty names fail the entire retrieval. The complete address remains in Contract Address. An abbreviated-identity collision throws instead of dropping any module or inventing an ordinal.

Official contract source: https://github.com/silo-finance/silo-contracts-v3/blob/3db357d671e7fd3a6e591834e1d5b5054e950bb0/silo-vaults/contracts/incentives/VaultIncentivesModule.sol
Official product-manager configuration: https://v2.silo.finance/_next/static/chunks/1803-a0cafd21ebc74931.js
Official manager display labels: https://v2.silo.finance/_next/static/chunks/9907-dabcbf3be07329e4.js
