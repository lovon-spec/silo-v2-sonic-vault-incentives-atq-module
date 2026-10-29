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

Names combine a protocol/role prefix with the published parent-vault name. Empty or unsafe name metadata uses the full emitted module address. Long names use ellipsis; collisions use the full module address. Notes identify the parent vault and contract role. The protocol UI link and project name identify the contract system, without endorsing a permissionless manager.

Use Yarn and yarn build. All logic is in src/main.mts, exporting only async returnTags with two string arguments. MIT licensed, derived from our own original module.
