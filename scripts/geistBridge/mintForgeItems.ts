import { ethers } from "hardhat";
import fs from "fs";
import { ForgeFacet } from "../../typechain";
import { maticDiamondAddress } from "../helperFunctions";

interface MintingProgress {
  totalProcessed: number;
  lastBatchIndex: number;
  failedBatches: number[];
  startTime: number;
  processedAddresses: {
    [address: string]: {
      itemIds: string[];
      timestamp: number;
    };
  };
}

export const FORGE_ITEMS_DIR = `${__dirname}/forgeWearables`;
const PROCESSED_FORGE_ITEMS_DIR = `${FORGE_ITEMS_DIR}/processed/`;

interface ForgeItemBalance {
  tokenId: string;
  balance: number;
}

interface MintBatch {
  owners: string[];
  itemBalances: ForgeItemBalance[][];
}

const BATCH_SIZE = 500; // Number of addresses per batch
const MAX_RETRIES = 3;
const FORGE_ITEMS_FILE = `${FORGE_ITEMS_DIR}/forgeWearables-regular.json`;
const PROGRESS_FILE = `${PROCESSED_FORGE_ITEMS_DIR}forge-items-progress.json`;

async function loadProgress(): Promise<MintingProgress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, create it
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify([]));
    return {
      totalProcessed: 0,
      lastBatchIndex: 0,
      failedBatches: [],
      startTime: Date.now(),
      processedAddresses: {},
    };
  }
}

function createBatches(
  forgeItemsData: Record<string, ForgeItemBalance[]>
): MintBatch[] {
  const batches: MintBatch[] = [];
  const entries = Object.entries(forgeItemsData);

  // Batch addresses, 500 per batch
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batchEntries = entries.slice(i, i + BATCH_SIZE);
    batches.push({
      owners: batchEntries.map(([owner]) => owner),
      itemBalances: batchEntries.map(([, balances]) => balances),
    });
  }
  return batches;
}

async function processBatch(
  contract: ForgeFacet,
  batch: MintBatch,
  progress: MintingProgress,
  batchIndex: number,
  retryCount = 0
): Promise<boolean> {
  try {
    // const tx = await contract.batchMintForgeItems(
    //   batch.owners.map((owner, i) => ({
    //     to: owner,
    //     itemBalances: batch.itemBalances[i].map((item) => ({
    //       itemId: ethers.BigNumber.from(item.tokenId),
    //       quantity: item.balance,
    //     })),
    //   }))
    // );
    // await tx.wait();

    // Record successful mint
    batch.owners.forEach((owner, i) => {
      progress.processedAddresses[owner] = {
        itemIds: batch.itemBalances[i].map((item) => item.tokenId),
        timestamp: Date.now(),
      };
    });

    return true;
  } catch (error) {
    console.error(`Error processing batch:`, error);
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying batch... (${retryCount + 1}/${MAX_RETRIES})`);
      return processBatch(
        contract,
        batch,
        progress,
        batchIndex,
        retryCount + 1
      );
    }
    return false;
  }
}

function printAnalytics(progress: MintingProgress, totalBatches: number) {
  const timeElapsed = Date.now() - progress.startTime;
  const successRate =
    ((progress.totalProcessed - progress.failedBatches.length) /
      progress.totalProcessed) *
    100;
  const processedAddressCount = Object.keys(progress.processedAddresses).length;
  const totalItemsMinted = Object.values(progress.processedAddresses).reduce(
    (acc, curr) => acc + curr.itemIds.length,
    0
  );

  console.log("\n=== Minting Analytics ===");
  console.log(
    `Total Batches Processed: ${progress.totalProcessed}/${totalBatches}`
  );
  console.log(`Failed Batches: ${progress.failedBatches.length}`);
  console.log(`Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`Processed Addresses: ${processedAddressCount}`);
  console.log(`Total Items Minted: ${totalItemsMinted}`);
  console.log(`Time Elapsed: ${(timeElapsed / 1000 / 60).toFixed(2)} minutes`);
  console.log(
    `Average Time per Batch: ${(
      timeElapsed /
      progress.totalProcessed /
      1000
    ).toFixed(2)} seconds`
  );
  console.log("=======================\n");
}

export async function mintForgeItems() {
  // Create processed directory if it doesn't exist
  if (!fs.existsSync(PROCESSED_FORGE_ITEMS_DIR)) {
    fs.mkdirSync(PROCESSED_FORGE_ITEMS_DIR, { recursive: true });
  }

  const forgeItemsData = JSON.parse(fs.readFileSync(FORGE_ITEMS_FILE, "utf8"));

  console.log("Loaded Forge Items data:");
  console.log(`Total unique owners: ${Object.keys(forgeItemsData).length}`);
  console.log(
    `Total items to mint: ${Object.values(forgeItemsData).reduce(
      (acc, items: ForgeItemBalance[]) =>
        acc + items.reduce((sum, item) => sum + item.balance, 0),
      0
    )}`
  );

  const contract = (await ethers.getContractAt(
    "ForgeFacet",
    maticDiamondAddress
  )) as ForgeFacet;
  const progress = await loadProgress();
  const batches = createBatches(forgeItemsData);

  console.log(`Starting minting process with ${batches.length} batches`);
  console.log(`Continuing from batch ${progress.lastBatchIndex}`);

  for (let i = progress.lastBatchIndex; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length}`);

    const success = await processBatch(contract, batch, progress, i);
    progress.totalProcessed++;
    progress.lastBatchIndex = i + 1;

    if (!success) {
      progress.failedBatches.push(i);
    }

    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    printAnalytics(progress, batches.length);
  }

  // Final analytics
  console.log("\n=== Final Minting Results ===");
  const totalItemsMinted = Object.values(progress.processedAddresses).reduce(
    (acc, curr) => acc + curr.itemIds.length,
    0
  );
  console.log(`Total Items Minted: ${totalItemsMinted}`);
  console.log(`Failed Batches: ${progress.failedBatches.join(", ") || "None"}`);
  console.log("============================");
}

if (require.main === module) {
  mintForgeItems()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
