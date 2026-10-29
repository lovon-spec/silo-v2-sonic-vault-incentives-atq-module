import type { ContractTag, ITagService } from "atq-types";

const DEPLOYMENT = "QmQUcPAEpUQJL3AYK21hsgNnj6XmWepTXJXySHdFXMmp7p";
const ENDPOINT = `https://gateway.thegraph.com/api/deployments/id/${DEPLOYMENT}`;
const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;

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

function toTag(module: Module): ContractTag {
  if (!address(module.id) || !address(module.module?.id) || module.id === module.vault.id) {
    throw new Error("A Silo vault incentives module has invalid identity or vault metadata.");
  }
  let name = plainName(module.vault.name)
    ? `Silo Incentives ${module.vault.name.trim()}` : `Silo ${module.id}`;
  if ([...name].length > 47) name = [...name].slice(0, 44).join("") + "...";
  return {
    "Contract Address": `eip155:146:${module.id}`,
    "Public Name Tag": name,
    "Project Name": "Silo Finance",
    "UI/Website Link": "https://app.silo.finance/",
    "Public Note": `Incentives module for legacy Silo managed vault ${module.vault.id}. ` +
      `Manages incentive-claiming logic and reward notifications for this vault. ` +
      `Vault deployment is permissionless; this tag does not endorse its manager.`,
  };
}

const service: ITagService = {
  returnTags: async (chainId: string, apiKey: string): Promise<ContractTag[]> => {
    if (chainId !== "146") throw new Error(`Unsupported Chain ID: ${chainId}.`);
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new Error("A query-service API key must be supplied.");
    }
    let requests = 0;
    async function query<T>(request: { query: string; variables?: object }): Promise<T> {
      if (++requests > MAX_PAGES + 2) throw new Error("Silo V2 query limit reached.");
      if (requests > 1) await new Promise<void>(resolve => setTimeout(resolve, 2000));
      const response = await fetch(ENDPOINT, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Silo V2 query failed with HTTP ${response.status}.`);
      const result = await response.json() as { data?: T; errors?: unknown };
      if (!result.data || (result.errors !== undefined &&
          (!Array.isArray(result.errors) || result.errors.length > 0))) {
        throw new Error("The Silo V2 query did not return complete data.");
      }
      return result.data;
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
        throw new Error("The Silo managed-vault page is invalid.");
      }
      for (const module of data.vaultIncentivesModules) {
        if (!address(module?.id) || (cursor !== null && module.id <= cursor)) {
          throw new Error("Silo managed-vault IDs are repeated or not in cursor order.");
        }
        tags.push(toTag(module));
        cursor = module.id;
      }
      if (data.vaultIncentivesModules.length < PAGE_SIZE) { complete = true; break; }
    }
    // A resource limit throws; it never returns a truncated contract set.
    if (!complete) throw new Error("Silo managed-vault pagination did not finish.");
    const seal = await query<{ _meta: Meta }>({
      query: "query Seal($block:Block_height!){_meta(block:$block){deployment hasIndexingErrors block{number hash}}}",
      variables: { block },
    });
    sameMeta(seal._meta, anchor);

    const names = new Map<string, number>();
    for (const tag of tags) {
      const name = tag["Public Name Tag"].toLowerCase();
      names.set(name, (names.get(name) ?? 0) + 1);
    }
    // Metadata collisions use the complete source address as the identifier.
    // This retains every vault, without fabricated instance numbers or skips.
    for (const tag of tags) {
      if (names.get(tag["Public Name Tag"].toLowerCase()) !== 1) {
        tag["Public Name Tag"] = "Silo " + tag["Contract Address"].split(":")[2];
      }
    }
    return tags;
  },
};

export async function returnTags(chainId: string, apiKey: string): Promise<ContractTag[]> {
  return service.returnTags(chainId, apiKey);
}
