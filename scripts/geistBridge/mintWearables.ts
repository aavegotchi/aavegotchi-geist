import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { BigNumber } from "ethers";
import { getRelayerSigner } from "../helperFunctions";
import { DATA_PATH, PROCESSED_PATH } from "./paths";

const MAX_RETRIES = 3;

const WEARABLES_FILE = path.join(
  DATA_PATH,
  "wearables",
  "wearables-regular.json"
);
const PROGRESS_FILE = path.join(PROCESSED_PATH, "wearables-progress.json");
const MAX_ENTRIES_PER_BATCH = 300;

interface WearableBalance {
  itemId: string;
  balance: number;
}

interface BatchDetail {
  batchIndex: number;
  ownersInBatch: string[];
  itemBalancesInBatch: WearableBalance[][];
  success: boolean;
  attemptTimestamp: number;
}

interface MintingProgress {
  startTime: number;
  lastProcessedBatchIndexInLastRun: number;
  failedBatchIndexesInLastRun: number[];
  processedOwnerItems: Record<string, Set<string>>;
  batchDetails: BatchDetail[];
}

async function loadProgress(): Promise<MintingProgress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    const parsedData = JSON.parse(data);

    if (
      parsedData.totalProcessed !== undefined ||
      parsedData.lastBatchIndex !== undefined
    ) {
      console.log("Old wearables progress file format detected. Migrating...");
      const migratedProcessedOwnerItems: Record<string, Set<string>> = {};
      if (parsedData.processedAddresses) {
        for (const owner in parsedData.processedAddresses) {
          if (parsedData.processedAddresses[owner].itemIds) {
            migratedProcessedOwnerItems[owner] = new Set(
              parsedData.processedAddresses[owner].itemIds
            );
          }
        }
      }
      return {
        startTime: parsedData.startTime || Date.now(),
        lastProcessedBatchIndexInLastRun: parsedData.lastBatchIndex
          ? parsedData.lastBatchIndex - 1
          : -1,
        failedBatchIndexesInLastRun: parsedData.failedBatches || [],
        processedOwnerItems: migratedProcessedOwnerItems,
        batchDetails: [],
      };
    }

    const processedOwnerItems: Record<string, Set<string>> = {};
    if (parsedData.processedOwnerItems) {
      for (const owner in parsedData.processedOwnerItems) {
        processedOwnerItems[owner] = new Set(
          parsedData.processedOwnerItems[owner]
        );
      }
    }

    return {
      startTime: parsedData.startTime || Date.now(),
      lastProcessedBatchIndexInLastRun:
        parsedData.lastProcessedBatchIndexInLastRun === undefined
          ? -1
          : parsedData.lastProcessedBatchIndexInLastRun,
      failedBatchIndexesInLastRun: parsedData.failedBatchIndexesInLastRun || [],
      processedOwnerItems: processedOwnerItems,
      batchDetails: parsedData.batchDetails || [],
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("Wearables progress file not found. Starting fresh.");
      const initialProgress: MintingProgress = {
        startTime: Date.now(),
        lastProcessedBatchIndexInLastRun: -1,
        failedBatchIndexesInLastRun: [],
        processedOwnerItems: {},
        batchDetails: [],
      };
      if (!fs.existsSync(PROCESSED_PATH)) {
        fs.mkdirSync(PROCESSED_PATH, { recursive: true });
      }
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(initialProgress, null, 2));
      return initialProgress;
    } else {
      console.error("Error loading wearables progress:", error);
      throw error;
    }
  }
}

function saveProgress(progress: MintingProgress) {
  const tempProgressFile = PROGRESS_FILE + ".tmp";
  try {
    const serializableProgress = {
      ...progress,
      processedOwnerItems: Object.fromEntries(
        Object.entries(progress.processedOwnerItems).map(([owner, itemSet]) => [
          owner,
          Array.from(itemSet),
        ])
      ),
    };
    fs.writeFileSync(
      tempProgressFile,
      JSON.stringify(serializableProgress, null, 2)
    );
    fs.renameSync(tempProgressFile, PROGRESS_FILE);
  } catch (error) {
    console.error("Error saving wearables progress:", error);
    if (fs.existsSync(tempProgressFile)) {
      try {
        fs.unlinkSync(tempProgressFile);
      } catch (cleanupError) {
        console.error(
          "Error cleaning up temp wearables progress file:",
          cleanupError
        );
      }
    }
  }
}

function createBatches(
  allWearablesData: Record<string, WearableBalance[]>,
  processedOwnerItems: Record<string, Set<string>>
): MintBatch[] {
  console.log(
    "Creating batches with dynamic strategy (max 400 entries per batch)..."
  );
  const finalBatches: MintBatch[] = [];

  const remainingOwnerEntries: [string, WearableBalance[]][] = [];
  let totalEntriesToProcess = 0;

  for (const owner in allWearablesData) {
    if (Object.prototype.hasOwnProperty.call(allWearablesData, owner)) {
      const allBalancesForOwner = allWearablesData[owner];
      const processedItemsForThisOwner =
        processedOwnerItems[owner] || new Set<string>();

      const remainingBalancesForOwner = allBalancesForOwner.filter(
        (wb) => !processedItemsForThisOwner.has(wb.itemId)
      );

      if (remainingBalancesForOwner.length > 0) {
        remainingOwnerEntries.push([owner, remainingBalancesForOwner]);
        totalEntriesToProcess += remainingBalancesForOwner.length;
      }
    }
  }

  if (totalEntriesToProcess === 0) {
    console.log("All wearable items are already marked as processed.");
    return [];
  }
  console.log(
    `Identified ${totalEntriesToProcess} total wearable entries remaining to be batched across ${remainingOwnerEntries.length} owners.`
  );

  let currentBatchOwners: string[] = [];
  let currentBatchItemBalances: WearableBalance[][] = [];
  let currentBatchTotalEntries = 0;
  const itemsAddedToCurrentBatchFromOwner: Map<string, Set<string>> = new Map();

  for (const [owner, ownerBalances] of remainingOwnerEntries) {
    let entriesTakenFromThisOwnerForCurrentBatch = 0;

    for (const wearableBalance of ownerBalances) {
      const ownerItemsInThisBatch =
        itemsAddedToCurrentBatchFromOwner.get(owner) || new Set<string>();
      if (ownerItemsInThisBatch.has(wearableBalance.itemId)) {
        continue;
      }

      if (currentBatchTotalEntries >= MAX_ENTRIES_PER_BATCH) {
        if (currentBatchOwners.length > 0) {
          finalBatches.push({
            owners: currentBatchOwners,
            itemBalances: currentBatchItemBalances,
          });
        }
        currentBatchOwners = [];
        currentBatchItemBalances = [];
        currentBatchTotalEntries = 0;
        itemsAddedToCurrentBatchFromOwner.clear();
      }

      let ownerIndexInCurrentBatch = currentBatchOwners.indexOf(owner);
      if (ownerIndexInCurrentBatch === -1) {
        currentBatchOwners.push(owner);
        currentBatchItemBalances.push([]);
        ownerIndexInCurrentBatch = currentBatchOwners.length - 1;
      }

      currentBatchItemBalances[ownerIndexInCurrentBatch].push(wearableBalance);
      currentBatchTotalEntries++;
      entriesTakenFromThisOwnerForCurrentBatch++;

      ownerItemsInThisBatch.add(wearableBalance.itemId);
      itemsAddedToCurrentBatchFromOwner.set(owner, ownerItemsInThisBatch);

      if (currentBatchTotalEntries >= MAX_ENTRIES_PER_BATCH) {
        break;
      }
    }
    if (
      currentBatchTotalEntries >= MAX_ENTRIES_PER_BATCH &&
      currentBatchOwners.length > 0
    ) {
      finalBatches.push({
        owners: currentBatchOwners,
        itemBalances: currentBatchItemBalances,
      });
      currentBatchOwners = [];
      currentBatchItemBalances = [];
      currentBatchTotalEntries = 0;
      itemsAddedToCurrentBatchFromOwner.clear();
    }
  }

  if (currentBatchOwners.length > 0) {
    finalBatches.push({
      owners: currentBatchOwners,
      itemBalances: currentBatchItemBalances,
    });
  }

  console.log(`Created ${finalBatches.length} batches for wearables.`);
  return finalBatches;
}

interface MintBatch {
  owners: string[];
  itemBalances: WearableBalance[][];
}

async function processBatch(
  contract: AavegotchiBridgeFacet,
  batch: MintBatch,
  currentBatchDetail: BatchDetail,
  retryCount = 0
): Promise<boolean> {
  try {
    console.log(
      `Attempting to mint batch ${currentBatchDetail.batchIndex + 1} for ${
        batch.owners.length
      } owners.`
    );

    const itemsToMint = batch.owners.map((owner, ownerIndex) => {
      const ownerItemBalances = batch.itemBalances[ownerIndex];
      if (!Array.isArray(ownerItemBalances)) {
        console.error(
          `Error: itemBalances for owner ${owner} at batch.itemBalances[${ownerIndex}] is not an array. Skipping this owner.`
        );
        return { to: owner, itemBalances: [] };
      }
      return {
        to: owner,
        itemBalances: ownerItemBalances.map((wb, itemIndex) => {
          if (
            wb.itemId === undefined ||
            wb.itemId === null ||
            String(wb.itemId).trim() === ""
          ) {
            console.error(
              `Error: itemId is undefined, null, or empty for owner ${owner}, item index ${itemIndex} in batch ${
                currentBatchDetail.batchIndex + 1
              }. Raw item:`,
              wb
            );
            throw new Error(
              `Invalid itemId for owner ${owner}, item index ${itemIndex}`
            );
          }
          if (
            wb.balance === undefined ||
            wb.balance === null ||
            typeof wb.balance !== "number" ||
            isNaN(wb.balance)
          ) {
            console.error(
              `Error: balance is undefined, null, not a number, or NaN for owner ${owner}, itemId ${
                wb.itemId
              }, item index ${itemIndex} in batch ${
                currentBatchDetail.batchIndex + 1
              }. Raw item:`,
              wb
            );
            throw new Error(
              `Invalid balance for owner ${owner}, itemId ${wb.itemId}, item index ${itemIndex}`
            );
          }
          try {
            return {
              itemId: BigNumber.from(String(wb.itemId)),
              quantity: BigNumber.from(wb.balance),
            };
          } catch (conversionError: any) {
            console.error(
              `Error converting itemId or balance to BigNumber for owner ${owner}, itemId ${wb.itemId}, balance ${wb.balance}. Error: ${conversionError.message}`
            );
            throw conversionError;
          }
        }),
      };
    });

    const validItemsToMint = itemsToMint.filter(
      (itemGroup) => itemGroup.itemBalances.length > 0
    );

    if (validItemsToMint.length === 0) {
      console.log(
        `Batch ${
          currentBatchDetail.batchIndex + 1
        } has no valid items to mint after filtering. Marking as success (no-op).`
      );
      currentBatchDetail.success = true;
      return true;
    }

    const tx = await contract.batchMintItems(validItemsToMint);
    await ethers.provider.waitForTransaction(tx.hash, 1);
    console.log(
      `Successfully minted items for batch ${
        currentBatchDetail.batchIndex + 1
      } via tx: ${tx.hash}`
    );
    currentBatchDetail.success = true;
    return true;
  } catch (error: any) {
    console.error(
      `Error processing batch ${currentBatchDetail.batchIndex + 1}, try ${
        retryCount + 1
      }:`,
      error.message || error
    );
    if (retryCount < MAX_RETRIES) {
      console.log(
        `Retrying batch ${currentBatchDetail.batchIndex + 1}... (${
          retryCount + 1
        }/${MAX_RETRIES})`
      );
      return processBatch(contract, batch, currentBatchDetail, retryCount + 1);
    }
    currentBatchDetail.success = false;
    return false;
  }
}

function printAnalytics(
  progress: MintingProgress,
  totalBatchesInCurrentRun: number
) {
  const timeElapsed = Date.now() - progress.startTime;
  let totalSuccessfullyMintedItems = 0;
  let totalSuccessfullyMintedEntries = 0;
  const processedAddressesThisRun = new Set<string>();

  progress.batchDetails.forEach((detail) => {
    if (detail.success) {
      detail.itemBalancesInBatch.forEach((ownerBalances) => {
        ownerBalances.forEach((item) => {
          totalSuccessfullyMintedItems += item.balance;
          totalSuccessfullyMintedEntries++;
        });
      });
      detail.ownersInBatch.forEach((owner) =>
        processedAddressesThisRun.add(owner)
      );
    }
  });

  console.log("\n=== Wearable Minting Analytics ===");
  console.log(
    `Total Batches Attempted in this run: ${totalBatchesInCurrentRun}`
  );
  console.log(
    `Failed Batches in this run: ${progress.failedBatchIndexesInLastRun.length}`
  );
  console.log(
    `Total Processed Addresses (cumulative from successful batches): ${
      Object.keys(progress.processedOwnerItems).length
    }`
  );
  console.log(
    `Total Wearable Entries Minted (cumulative from successful batches): ${totalSuccessfullyMintedEntries}`
  );
  console.log(
    `Total Wearable Quantities Minted (cumulative from successful batches): ${totalSuccessfullyMintedItems}`
  );
  console.log(
    `Time Elapsed (since first script start): ${(
      timeElapsed /
      1000 /
      60
    ).toFixed(2)} minutes`
  );
  if (totalBatchesInCurrentRun > 0) {
    console.log(
      `Average Time per Batch (this run): ${(
        timeElapsed /
        (progress.batchDetails.filter(
          (b) => b.batchIndex >= progress.lastProcessedBatchIndexInLastRun + 1
        ).length || 1) /
        1000
      ).toFixed(2)} seconds`
    );
  }
  console.log("=================================\n");
}

export async function mintWearables() {
  const c = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  if (!fs.existsSync(PROCESSED_PATH)) {
    fs.mkdirSync(PROCESSED_PATH, { recursive: true });
  }

  const rawWearablesData: Record<string, any[]> = JSON.parse(
    fs.readFileSync(WEARABLES_FILE, "utf8")
  );

  const allWearablesData: Record<string, WearableBalance[]> = {};
  for (const owner in rawWearablesData) {
    if (Object.prototype.hasOwnProperty.call(rawWearablesData, owner)) {
      allWearablesData[owner] = rawWearablesData[owner].map((item) => ({
        itemId: item.tokenId,
        balance: item.balance,
      }));
    }
  }
  const progress = await loadProgress();

  console.log("Loaded Wearables data:");
  let totalInitialEntries = 0;
  Object.values(allWearablesData).forEach(
    (balances) => (totalInitialEntries += balances.length)
  );
  console.log(
    `Total unique owners in input file: ${Object.keys(allWearablesData).length}`
  );
  console.log(`Total wearable entries in input file: ${totalInitialEntries}`);

  const contract = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond!,
    signer
  )) as AavegotchiBridgeFacet;

  const batches = createBatches(allWearablesData, progress.processedOwnerItems);

  if (batches.length === 0) {
    console.log("No new wearable items to process based on progress file.");
    printAnalytics(progress, 0);
    return;
  }

  console.log(
    `Starting/resuming wearables minting process with ${batches.length} dynamically created batches.`
  );

  const startIndexForThisRun = 0;
  progress.failedBatchIndexesInLastRun = [];

  for (let i = startIndexForThisRun; i < batches.length; i++) {
    const batch = batches[i];
    const currentBatchDetail: BatchDetail = {
      batchIndex: i,
      ownersInBatch: batch.owners,
      itemBalancesInBatch: batch.itemBalances,
      success: false,
      attemptTimestamp: Date.now(),
    };
    progress.batchDetails.push(currentBatchDetail);

    const success = await processBatch(contract, batch, currentBatchDetail);

    if (success) {
      batch.owners.forEach((owner, ownerIdx) => {
        const itemsInBatchForOwner = batch.itemBalances[ownerIdx];
        if (!progress.processedOwnerItems[owner]) {
          progress.processedOwnerItems[owner] = new Set<string>();
        }
        itemsInBatchForOwner.forEach((itemBalance) => {
          progress.processedOwnerItems[owner].add(itemBalance.itemId);
        });
      });
    } else {
      progress.failedBatchIndexesInLastRun.push(i);
    }

    progress.lastProcessedBatchIndexInLastRun = i;
    saveProgress(progress);
    printAnalytics(progress, batches.length);
  }

  console.log("\n=== Final Wearable Minting Results for this Run ===");
  printAnalytics(progress, batches.length);
  if (progress.failedBatchIndexesInLastRun.length > 0) {
    console.warn(
      `Some batches failed in this run. Check failedBatchIndexesInLastRun and batchDetails in ${PROGRESS_FILE}`
    );
  }
  console.log("==================================================");
}

if (require.main === module) {
  mintWearables()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
