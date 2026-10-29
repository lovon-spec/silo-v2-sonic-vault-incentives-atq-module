import type { ContractTag, ITagService } from "atq-types";

const DEPLOYMENT = "QmQUcPAEpUQJL3AYK21hsgNnj6XmWepTXJXySHdFXMmp7p";
const ENDPOINT = `https://gateway.thegraph.com/api/deployments/id/${DEPLOYMENT}`;
const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const QUERY_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 600_000;

type Meta = {
  deployment: string;
  hasIndexingErrors: boolean;
  block: { number: number; hash: string };
};
type Module = {
  id: string;
  vault: { id: string; name: string };
};

function address(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value) &&
    value !== "0x" + "0".repeat(40);
}

function checkedMeta(meta: Meta): Meta {
  if (meta?.deployment !== DEPLOYMENT || meta.hasIndexingErrors !== false ||
      !Number.isSafeInteger(meta.block?.number) || meta.block.number < 1 ||
      !/^0x[0-9a-f]{64}$/.test(meta.block?.hash ?? "")) {
    throw new Error("The Silo V2 source metadata is incomplete or unhealthy.");
  }
  return meta;
}

function sameMeta(meta: Meta, anchor: Meta): void {
  checkedMeta(meta);
  if (meta.block.number !== anchor.block.number || meta.block.hash !== anchor.block.hash) {
    throw new Error("The Silo V2 source snapshot changed.");
  }
}

function plainName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    !/[<\[\]`*\\_\u0000-\u001f\u007f]/.test(value);
}

// Product metadata from Silo's published vault-manager configuration. These
// aliases contain no contract IDs and never select, insert or filter a row.
// Every tag address, source name and asset comes from the Graph response.
const PRODUCT_MANAGER: Readonly<Record<string, string>> = {
  "yield optimized sonic": "Goat",
  "yield optimized usdc": "Goat",
  "mithras": "Travee",
  "abrc": "YieldFi",
  "mainstreet liquidity vault": "Braindead",
};
function officialName(value: unknown): string {
  if (typeof value !== "string" || [...value].length > 2048 || value.trim() && !plainName(value)) {
    throw new Error("A nonempty Silo vault name cannot be safely preserved.");
  }
  return value.trim();
}
function toTag(module: Module): ContractTag {
  if (!address(module.id) || !address(module.vault?.id) || module.id === module.vault.id) {
    throw new Error("A Silo vault incentives module has invalid identity or vault metadata.");
  }
  const sourceName = officialName(module.vault.name);
  const alias = Object.hasOwn(PRODUCT_MANAGER, sourceName.toLowerCase()) ? PRODUCT_MANAGER[sourceName.toLowerCase()] : null;
  const name = "VaultIncentivesModule " + module.id.slice(0, 14) + "..." + module.id.slice(-11);
  return {
    "Contract Address": `eip155:146:${module.id}`,
    "Public Name Tag": name,
    "Project Name": "Silo Finance",
    "UI/Website Link": "https://app.silo.finance/",
    "Public Note": `Incentives module for legacy Silo managed vault ${module.vault.id}. ` +
      `Manages incentive claiming logic and reward notifications for this vault. ` +
      `The parent vault is permissionlessly deployed. Protocol: Silo Finance. ` +
      `Source vault name: ${sourceName || "(empty)"}.` +
      (alias ? ` Official product manager: ${alias}.` : ""),
  };
}

const service: ITagService = {
  returnTags: async (chainId: string, apiKey: string): Promise<ContractTag[]> => {
    if (chainId !== "146") throw new Error(`Unsupported Chain ID: ${chainId}.`);
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new Error("A query-service API key must be supplied.");
    }
    let requests = 0;
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    async function query<T>(request: { query: string; variables?: object }): Promise<T> {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Silo V2 execution deadline reached.");
      const waitMs = Math.min(QUERY_TIMEOUT_MS, remaining);
      const queryDeadline = Date.now() + waitMs;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            if (++requests > MAX_PAGES + 2) throw new Error("Silo V2 query limit reached.");
            if (requests > 1) await new Promise<void>(resolve => setTimeout(resolve, 2000));
            if (controller.signal.aborted || Date.now() >= queryDeadline) {
              throw new Error("Silo V2 query deadline reached.");
            }
            const response = await fetch(ENDPOINT, {
              method: "POST",
              redirect: "error",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify(request),
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Silo V2 query failed with HTTP ${response.status}.`);
            const result = await response.json() as { data?: T; errors?: unknown };
            if (Date.now() >= queryDeadline) throw new Error("Silo V2 query deadline reached.");
            if (!result.data || (result.errors !== undefined &&
                (!Array.isArray(result.errors) || result.errors.length > 0))) {
              throw new Error("The Silo V2 query did not return complete data.");
            }
            return result.data;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("Silo V2 query deadline reached."));
            }, waitMs);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        controller.abort();
      }
    }

    const anchor = checkedMeta((await query<{ _meta: Meta }>({
      query: "{_meta{deployment hasIndexingErrors block{number hash}}}",
    }))._meta);
    const block = { hash: anchor.block.hash };
    const tags: ContractTag[] = [];
    let cursor: string | null = null;
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const continued = cursor !== null;
      // The first page is unfiltered. Later cursors are actual unique Bytes IDs.
      const data: { vaultIncentivesModules: Module[]; _meta: Meta } = await query({
        query: "query VaultIncentivesModules(" + (continued ? "$cursor:Bytes!," : "") + "$block:Block_height!){" +
          "vaultIncentivesModules(first:1000,orderBy:id,orderDirection:asc," +
          (continued ? "where:{id_gt:$cursor}," : "") + "block:$block){" +
          "id vault{id name}}" +
          " _meta(block:$block){deployment hasIndexingErrors block{number hash}}}",
        variables: { ...(continued ? { cursor } : {}), block },
      });
      sameMeta(data._meta, anchor);
      if (!Array.isArray(data.vaultIncentivesModules) || data.vaultIncentivesModules.length > PAGE_SIZE) {
        throw new Error("The Silo vault-incentives module page is invalid.");
      }
      for (const module of data.vaultIncentivesModules) {
        if (!address(module?.id) || (cursor !== null && module.id <= cursor)) {
          throw new Error("Silo vault-incentives module IDs are repeated or not in cursor order.");
        }
        tags.push(toTag(module));
        cursor = module.id;
      }
      if (data.vaultIncentivesModules.length < PAGE_SIZE) { complete = true; break; }
    }
    // A resource limit throws; it never returns a truncated contract set.
    if (!complete) throw new Error("Silo vault-incentives module pagination did not finish.");
    const seal = await query<{ _meta: Meta }>({
      query: "query Seal($block:Block_height!){_meta(block:$block){deployment hasIndexingErrors block{number hash}}}",
      variables: { block },
    });
    sameMeta(seal._meta, anchor);

    const names = new Set<string>();
    for (const tag of tags) {
      const key = tag["Public Name Tag"].toLowerCase();
      if (names.has(key)) throw new Error("Abbreviated incentives-module identities collide.");
      names.add(key);
    }
    return tags;
  },
};

export async function returnTags(chainId: string, apiKey: string): Promise<ContractTag[]> {
  return service.returnTags(chainId, apiKey);
}
