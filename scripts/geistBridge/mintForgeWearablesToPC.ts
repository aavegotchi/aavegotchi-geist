import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { ForgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { PC_WALLET } from "./paths";

// Paths to data files
const DATA_PATH = path.join(__dirname, "cloneData/forgeWearables");
const WITHOUT_EOA_FILE = path.join(
  DATA_PATH,
  "forgeWearables-contractsWithoutEOAs.json"
);
const WITH_EOA_FILE = path.join(
  DATA_PATH,
  "forgeWearables-contractsWithEOA.json"
);
const GBM_FILE = path.join(DATA_PATH, "forgeWearables-gbmDiamond.json");

interface ItemBalance {
  tokenId: string;
  balance: number;
}

type OwnerData = { [ownerAddress: string]: ItemBalance[] };

async function main() {
  console.log("--- Starting Forge Wearables minting script ---");

  // ---------------- Load data ----------------
  let ownerData: OwnerData = {};

  // 1. Contracts WITHOUT EOAs
  if (fs.existsSync(WITHOUT_EOA_FILE)) {
    console.log(`Reading owner data from ${WITHOUT_EOA_FILE}`);
    const json: OwnerData = JSON.parse(
      fs.readFileSync(WITHOUT_EOA_FILE, "utf8")
    );
    ownerData = { ...ownerData, ...json };
  } else {
    console.warn(`File not found: ${WITHOUT_EOA_FILE}. Continuing.`);
  }

  // 2. Contracts WITH EOAs
  if (fs.existsSync(WITH_EOA_FILE)) {
    console.log(`Reading owner data from ${WITH_EOA_FILE}`);
    const json: OwnerData = JSON.parse(fs.readFileSync(WITH_EOA_FILE, "utf8"));
    ownerData = { ...ownerData, ...json };
  } else {
    console.warn(`File not found: ${WITH_EOA_FILE}. Continuing.`);
  }

  // 3. GBM Diamond wearables (array)
  let gbmWearables: ItemBalance[] = [];
  if (fs.existsSync(GBM_FILE)) {
    console.log(`Reading GBM wearables from ${GBM_FILE}`);
    gbmWearables = JSON.parse(fs.readFileSync(GBM_FILE, "utf8"));
  } else {
    console.warn(`File not found: ${GBM_FILE}. No GBM wearables.`);
  }

  // ---------------- Aggregate balances ----------------
  const aggregateMap: { [tokenId: string]: number } = {};

  // 3a. From owner data
  for (const items of Object.values(ownerData)) {
    for (const it of items) {
      aggregateMap[it.tokenId] = (aggregateMap[it.tokenId] || 0) + it.balance;
    }
  }

  // 3b. From GBM list
  for (const it of gbmWearables) {
    aggregateMap[it.tokenId] = (aggregateMap[it.tokenId] || 0) + it.balance;
  }

  const aggregatedWearables: ItemBalance[] = Object.entries(aggregateMap).map(
    ([tokenId, balance]) => ({ tokenId, balance })
  );

  if (aggregatedWearables.length === 0) {
    console.log("No forge wearables found to mint. Exiting.");
    return;
  }

  console.log(
    `Total unique forge wearable types to mint: ${aggregatedWearables.length}`
  );

  // ---------------- Prepare contract ----------------
  const c = await varsForNetwork(ethers);
  if (!c.aavegotchiDiamond) {
    throw new Error("aavegotchiDiamond address not set in constants");
  }
  // @ts-ignore - hre injected by hardhat runtime
  const signer = await getRelayerSigner(hre);

  const contract = (await ethers.getContractAt(
    "ForgeFacet",
    c.forgeDiamond!,
    signer
  )) as ForgeFacet;

  // ---------------- Mint to PC_WALLET ----------------
  console.log(
    `\nMinting ${aggregatedWearables.length} forge wearable types to PC_WALLET (${PC_WALLET})...`
  );

  try {
    const tx = await contract.batchMintForgeItems([
      {
        to: PC_WALLET,
        itemBalances: aggregatedWearables.map((it) => ({
          itemId: ethers.BigNumber.from(it.tokenId),
          quantity: it.balance,
        })),
      },
    ]);
    console.log(`  - Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log("  - ✅ Forge wearables minted to PC_WALLET");
  } catch (error: any) {
    console.error(
      "  - ❌ Failed to mint forge wearables:",
      error.message || error
    );
  }

  console.log("\n--- Script finished ---");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
