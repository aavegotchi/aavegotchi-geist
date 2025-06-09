import { ethers } from "hardhat";
import fs from "fs";
import { ForgeFacet } from "../../typechain";
import { maticDiamondAddress, getRelayerSigner } from "../helperFunctions";
import { varsForNetwork } from "../../helpers/constants";
import { DATA_PATH, PROCESSED_PATH } from "./paths";

interface MintingProgress {
  totalProcessed: number;
  lastBatchIndex: number;
  failedBatches: {
    index: number;
    error: string;
    retryCount: number;
    timestamp: number;
  }[];
  startTime: number;
  lastUpdateTime: number;
  processedAddresses: {
    [address: string]: {
      itemIds: string[];
      timestamp: number;
      batchIndex: number;
    };
  };
  statistics: {
    totalItemsMinted: number;
    totalAddressesProcessed: number;
    averageBatchProcessingTime: number;
    lastSuccessfulBatchTime: number;
  };
}

export const FORGE_ITEMS_DIR = `${DATA_PATH}/forgeWearables`;

interface ForgeItemBalance {
  tokenId: string;
  balance: number;
}

interface MintBatch {
  owners: string[];
  itemBalances: ForgeItemBalance[][];
}

const BATCH_SIZE = 50; // Number of addresses per batch
const MAX_ITEMS_PER_TX = 1000; // Maximum items to mint in a single transaction
const MAX_RETRIES = 3;
const FORGE_ITEMS_FILE = `${FORGE_ITEMS_DIR}/forgeWearables-regular.json`;
const PROGRESS_FILE = `${PROCESSED_PATH}/forge_minting_progress.json`;

async function loadProgress(): Promise<MintingProgress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    const progress = JSON.parse(data);
    return {
      totalProcessed: progress.totalProcessed || 0,
      lastBatchIndex: progress.lastBatchIndex || 0,
      failedBatches: progress.failedBatches || [],
      startTime: progress.startTime || Date.now(),
      lastUpdateTime: progress.lastUpdateTime || Date.now(),
      processedAddresses: progress.processedAddresses || {},
      statistics: progress.statistics || {
        totalItemsMinted: 0,
        totalAddressesProcessed: 0,
        averageBatchProcessingTime: 0,
        lastSuccessfulBatchTime: 0,
      },
    };
  } catch (error) {
    const initialProgress: MintingProgress = {
      totalProcessed: 0,
      lastBatchIndex: 0,
      failedBatches: [],
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      processedAddresses: {},
      statistics: {
        totalItemsMinted: 0,
        totalAddressesProcessed: 0,
        averageBatchProcessingTime: 0,
        lastSuccessfulBatchTime: 0,
      },
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(initialProgress, null, 2));
    return initialProgress;
  }
}

function createBatches(
  forgeItemsData: Record<string, ForgeItemBalance[]>
): MintBatch[] {
  const batches: MintBatch[] = [];
  const entries = Object.entries(forgeItemsData);

  // Process each address
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batchEntries = entries.slice(i, i + BATCH_SIZE);
    const batchOwners: string[] = [];
    const batchItemBalances: ForgeItemBalance[][] = [];

    // Process each address in the batch
    for (const [owner, items] of batchEntries) {
      // Check if this address has too many items
      const totalItems = items.reduce((sum, item) => sum + item.balance, 0);

      if (totalItems > MAX_ITEMS_PER_TX) {
        // Split into smaller chunks
        let remainingItems = [...items];
        while (remainingItems.length > 0) {
          const chunk: ForgeItemBalance[] = [];
          let chunkTotal = 0;

          // Fill chunk up to MAX_ITEMS_PER_TX
          while (remainingItems.length > 0 && chunkTotal < MAX_ITEMS_PER_TX) {
            const item = remainingItems[0];
            if (chunkTotal + item.balance <= MAX_ITEMS_PER_TX) {
              chunk.push(item);
              chunkTotal += item.balance;
              remainingItems.shift();
            } else {
              // Split this item
              const remainingBalance = MAX_ITEMS_PER_TX - chunkTotal;
              chunk.push({ ...item, balance: remainingBalance });
              remainingItems[0] = {
                ...item,
                balance: item.balance - remainingBalance,
              };
              break;
            }
          }

          batchOwners.push(owner);
          batchItemBalances.push(chunk);
        }
      } else {
        // Normal case - add all items
        batchOwners.push(owner);
        batchItemBalances.push(items);
      }
    }

    // Create batches of MAX_BATCH_SIZE
    for (let j = 0; j < batchOwners.length; j += BATCH_SIZE) {
      batches.push({
        owners: batchOwners.slice(j, j + BATCH_SIZE),
        itemBalances: batchItemBalances.slice(j, j + BATCH_SIZE),
      });
    }
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
    const tx = await contract.batchMintForgeItems(
      batch.owners.map((owner, i) => ({
        to: owner,
        itemBalances: batch.itemBalances[i].map((item) => ({
          itemId: ethers.BigNumber.from(item.tokenId),
          quantity: item.balance,
        })),
      }))
    );
    //    await tx.wait();

    // Record successful mint
    batch.owners.forEach((owner, i) => {
      progress.processedAddresses[owner] = {
        itemIds: batch.itemBalances[i].map((item) => item.tokenId),
        timestamp: Date.now(),
        batchIndex: batchIndex,
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
  const c = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  // Create processed directory if it doesn't exist
  if (!fs.existsSync(PROCESSED_PATH)) {
    fs.mkdirSync(PROCESSED_PATH, { recursive: true });
  }

  const forgeItemsData = JSON.parse(fs.readFileSync(FORGE_ITEMS_FILE, "utf8"));

  console.log("Loaded Forge Items data:");
  console.log(`Total unique owners: ${Object.keys(forgeItemsData).length}`);
  console.log(
    `Total items to mint: ${Object.values(forgeItemsData).reduce(
      (acc: number, items) =>
        acc +
        (items as ForgeItemBalance[]).reduce(
          (sum, item) => sum + item.balance,
          0
        ),
      0
    )}`
  );

  const contract = (await ethers.getContractAt(
    "ForgeFacet",
    c.forgeDiamond!,
    signer
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
      progress.failedBatches.push({
        index: i,
        error: "Retry limit reached",
        retryCount: MAX_RETRIES,
        timestamp: Date.now(),
      });
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
  console.log(
    `Failed Batches: ${progress.failedBatches
      .map((f) => `${f.index}: ${f.error}`)
      .join(", ")}`
  );
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
