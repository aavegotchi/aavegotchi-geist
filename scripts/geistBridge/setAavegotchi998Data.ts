import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { BigNumber } from "ethers";
import { AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { PROCESSED_PATH, DATA_PATH } from "./paths";

// === Configuration ===
const MAX_RETRIES = 3;
// const BATCH_SIZE = 100; // Removed: Number of Aavegotchis (parent tokenIds) to process per transaction
const MAX_ITEM_ENTRIES_PER_BATCH = 300; // New dynamic batching limit
const INPUT_JSON_FILE = path.join(
  DATA_PATH,
  "aavegotchi",
  "aavegotchi998Data.json"
);
const PROGRESS_FILE = path.join(
  PROCESSED_PATH,
  "setAavegotchi998Data-progress.json"
);
// =====================

// Interface for the structure of each item in the input JSON
interface JsonItemDetail {
  itemId: string;
  amount: string; // Expect string from JSON for BigNumber conversion
}

// Interface for the overall structure of the input JSON
// Maps Aavegotchi Token ID (string) to an object of its items
type InputJsonData = Record<string, Record<string, JsonItemDetail>>;

// Interface for contract's AavegotchiItembalance struct
interface ContractAavegotchiItemBalance {
  itemid: BigNumber;
  balance: BigNumber;
}

// Interface for contract's Aavegotchi998Data struct
interface ContractAavegotchi998Data {
  tokenId: BigNumber; // Aavegotchi's token ID
  balances: ContractAavegotchiItemBalance[];
}

interface BatchAttemptDetail {
  batchIndex: number; // 0-indexed for the current run of Aavegotchi tokenIds
  parentTokenIdsAttempted: string[]; // Aavegotchi tokenIds in this batch
  success: boolean;
  attemptTimestamp: number;
}

interface Progress {
  startTime: number;
  // Set of Aavegotchi token IDs that have been successfully processed completely.
  processedParentTokenIds: Set<string>;
  // For the latest run:
  failedParentTokenIdBatchesInLastRun: number[]; // 0-indexed batch number of parentTokenId arrays
  lastProcessedParentTokenIdBatchIndexInLastRun: number; // 0-indexed
  batchAttemptDetails: BatchAttemptDetail[]; // Log of all batch attempts
}

// Function stubs to be implemented
async function loadProgress(): Promise<Progress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    const parsedData = JSON.parse(data);

    const processedParentTokenIds = new Set<string>(
      parsedData.processedParentTokenIds || []
    );

    return {
      startTime: parsedData.startTime || Date.now(),
      processedParentTokenIds: processedParentTokenIds,
      failedParentTokenIdBatchesInLastRun:
        parsedData.failedParentTokenIdBatchesInLastRun || [],
      lastProcessedParentTokenIdBatchIndexInLastRun:
        parsedData.lastProcessedParentTokenIdBatchIndexInLastRun === undefined
          ? -1
          : parsedData.lastProcessedParentTokenIdBatchIndexInLastRun,
      batchAttemptDetails: parsedData.batchAttemptDetails || [],
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log(`Progress file ${PROGRESS_FILE} not found. Starting fresh.`);
      return {
        startTime: Date.now(),
        processedParentTokenIds: new Set<string>(),
        failedParentTokenIdBatchesInLastRun: [],
        lastProcessedParentTokenIdBatchIndexInLastRun: -1,
        batchAttemptDetails: [],
      };
    } else {
      console.error(`Error loading progress file ${PROGRESS_FILE}:`, error);
      throw error; // Re-throw other errors
    }
  }
}

function saveProgress(progress: Progress): void {
  const tempProgressFile = PROGRESS_FILE + ".tmp";
  try {
    const serializableProgress = {
      ...progress,
      processedParentTokenIds: Array.from(progress.processedParentTokenIds), // Convert Set to Array
    };
    fs.writeFileSync(
      tempProgressFile,
      JSON.stringify(serializableProgress, null, 2)
    );
    fs.renameSync(tempProgressFile, PROGRESS_FILE);
  } catch (error) {
    console.error("Error saving progress:", error);
    if (fs.existsSync(tempProgressFile)) {
      try {
        fs.unlinkSync(tempProgressFile);
      } catch (cleanupError) {
        console.error("Error cleaning up temp progress file:", cleanupError);
      }
    }
  }
}

function createBatches(
  allData: InputJsonData,
  processedParentTokenIds: Set<string>
): ContractAavegotchi998Data[][] {
  console.log(
    `Creating batches with dynamic strategy (max ${MAX_ITEM_ENTRIES_PER_BATCH} item entries per batch)...`
  );
  const allParentTokenIds = Object.keys(allData);
  const unprocessedParentTokenIds = allParentTokenIds.filter(
    (id) => !processedParentTokenIds.has(id)
  );

  if (unprocessedParentTokenIds.length === 0) {
    console.log("All parent Aavegotchi token IDs are already processed.");
    return [];
  }
  console.log(
    `Found ${unprocessedParentTokenIds.length} unprocessed parent Aavegotchi token IDs to consider for batching.`
  );

  const transformedContractDataList: ContractAavegotchi998Data[] = [];
  for (const parentTokenId of unprocessedParentTokenIds) {
    const itemsForParent = allData[parentTokenId];
    const contractBalances: ContractAavegotchiItemBalance[] = [];
    for (const internalItemId in itemsForParent) {
      if (
        Object.prototype.hasOwnProperty.call(itemsForParent, internalItemId)
      ) {
        const itemDetail = itemsForParent[internalItemId];
        if (!itemDetail.itemId || String(itemDetail.itemId).trim() === "") {
          // console.warn(...); // Keep warnings if desired, or remove for cleaner logs if handled by data source
          continue;
        }
        if (
          itemDetail.amount === undefined ||
          itemDetail.amount === null ||
          String(itemDetail.amount).trim() === ""
        ) {
          // console.warn(...);
          continue;
        }
        try {
          contractBalances.push({
            itemid: BigNumber.from(String(itemDetail.itemId)),
            balance: BigNumber.from(String(itemDetail.amount)),
          });
        } catch (e: any) {
          // console.warn(...);
        }
      }
    }
    if (contractBalances.length > 0) {
      transformedContractDataList.push({
        tokenId: BigNumber.from(parentTokenId),
        balances: contractBalances,
      });
    } else {
      // Parent Aavegotchi has no valid items, won't be included.
      // Consider if these should be marked as processed if the goal is to attempt every parentTokenId once.
      // For now, they are just skipped from batching.
    }
  }

  if (transformedContractDataList.length === 0) {
    console.log(
      "No valid Aavegotchi 998 data to batch after transformation and filtering of unprocessed parent IDs."
    );
    return [];
  }

  const finalBatches: ContractAavegotchi998Data[][] = [];
  let currentBatch: ContractAavegotchi998Data[] = [];
  let currentBatchItemEntryCount = 0;

  for (const parentData of transformedContractDataList) {
    const numItemsInThisParent = parentData.balances.length;

    if (numItemsInThisParent > MAX_ITEM_ENTRIES_PER_BATCH) {
      console.warn(
        `Warning: Parent Aavegotchi ${parentData.tokenId.toString()} has ${numItemsInThisParent} item entries, which exceeds the MAX_ITEM_ENTRIES_PER_BATCH of ${MAX_ITEM_ENTRIES_PER_BATCH}. It will form a batch by itself.`
      );
      // If current batch is not empty, push it first
      if (currentBatch.length > 0) {
        finalBatches.push(currentBatch);
      }
      // Push the large item as its own batch
      finalBatches.push([parentData]);
      // Reset current batch for the next iteration
      currentBatch = [];
      currentBatchItemEntryCount = 0;
      continue; // Move to the next parentData
    }

    if (
      currentBatch.length > 0 &&
      currentBatchItemEntryCount + numItemsInThisParent >
        MAX_ITEM_ENTRIES_PER_BATCH
    ) {
      // Adding this parentData would exceed the limit, so finalize current batch
      finalBatches.push(currentBatch);
      // Start a new batch with the current parentData
      currentBatch = [parentData];
      currentBatchItemEntryCount = numItemsInThisParent;
    } else {
      // Add to current batch
      currentBatch.push(parentData);
      currentBatchItemEntryCount += numItemsInThisParent;
    }
  }

  // Add the last remaining batch if it has any items
  if (currentBatch.length > 0) {
    finalBatches.push(currentBatch);
  }

  console.log(
    `Created ${finalBatches.length} batches based on item entry count.`
  );
  return finalBatches;
}

async function processBatch(
  contract: AavegotchiBridgeFacet,
  batchData: ContractAavegotchi998Data[], // A single batch to send to the contract
  batchDetailToUpdate: BatchAttemptDetail
): Promise<boolean> {
  console.log(
    `Attempting to set 998 data for batch ${
      batchDetailToUpdate.batchIndex + 1
    } with ${batchData.length} Aavegotchi parent token(s).`
  );
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      const tx = await contract.setAavegotchi998Data(batchData);
      console.log(
        `Successfully set 998 data for batch ${
          batchDetailToUpdate.batchIndex + 1
        } via tx: ${tx.hash}`
      );
      batchDetailToUpdate.success = true;
      return true;
    } catch (error: any) {
      console.error(
        `Error processing batch ${batchDetailToUpdate.batchIndex + 1} on try ${
          retry + 1
        }/${MAX_RETRIES}:`,
        error.message || error
      );
      if (retry === MAX_RETRIES - 1) {
        console.error(
          `Batch ${
            batchDetailToUpdate.batchIndex + 1
          } failed after ${MAX_RETRIES} retries.`
        );
        batchDetailToUpdate.success = false;
        return false;
      }
      // Optional: add a delay before retrying
      // await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  batchDetailToUpdate.success = false; // Should be caught by retry === MAX_RETRIES -1
  return false;
}

function printAnalytics(
  progress: Progress,
  totalBatchesInCurrentRun: number
): void {
  const timeElapsed = Date.now() - progress.startTime;
  const totalParentTokenIdsProcessed = progress.processedParentTokenIds.size;

  console.log("\n=== Aavegotchi 998 Data Setting Analytics ===");
  console.log(
    `Total Batches Attempted in this run: ${totalBatchesInCurrentRun}`
  );
  console.log(
    `Failed Batches in this run: ${progress.failedParentTokenIdBatchesInLastRun.length}`
  );
  console.log(
    `Total Parent Aavegotchi Token IDs Processed (cumulative): ${totalParentTokenIdsProcessed}`
  );

  let totalItemsSetCount = 0;
  progress.batchAttemptDetails.forEach((detail) => {
    if (detail.success) {
      // To get exact item counts, we'd need to store dataSent in batchDetail or re-parse original data
      // For now, we can count successful parent tokenIds from details
    }
  });
  // console.log(`Total individual item links established (approximate): ${totalItemsSetCount}`);

  console.log(
    `Time Elapsed (since first script start): ${(
      timeElapsed /
      1000 /
      60
    ).toFixed(2)} minutes`
  );
  const batchesProcessedThisRunCount = progress.batchAttemptDetails.filter(
    (b) =>
      b.batchIndex >=
        progress.lastProcessedParentTokenIdBatchIndexInLastRun + 1 ||
      progress.batchAttemptDetails.length <= totalBatchesInCurrentRun
  ).length;

  if (batchesProcessedThisRunCount > 0) {
    console.log(
      `Average Time per Batch (this run): ${(
        timeElapsed /
        batchesProcessedThisRunCount /
        1000
      ).toFixed(2)} seconds`
    );
  }
  console.log("===========================================\n");
}

export async function setAavegotchi998DataScript() {
  console.log("Starting script to set Aavegotchi ERC998 data...");

  if (!fs.existsSync(PROCESSED_PATH)) {
    fs.mkdirSync(PROCESSED_PATH, { recursive: true });
  }

  const progress = await loadProgress();
  let allInputData: InputJsonData;
  try {
    const fileContent = fs.readFileSync(INPUT_JSON_FILE, "utf8");
    allInputData = JSON.parse(fileContent);
  } catch (e: any) {
    console.error(`Failed to read or parse ${INPUT_JSON_FILE}: ${e.message}`);
    process.exit(1);
  }

  const c = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  const contract = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond!,
    signer
  )) as AavegotchiBridgeFacet;

  console.log(`Preparing batches from ${INPUT_JSON_FILE}...`);
  const batches = createBatches(allInputData, progress.processedParentTokenIds);

  if (batches.length === 0) {
    console.log(
      "No new Aavegotchi data to process based on progress file or input data."
    );
    printAnalytics(progress, 0);
    return;
  }

  console.log(
    `Starting processing for ${batches.length} batches of Aavegotchi 998 data.`
  );
  progress.failedParentTokenIdBatchesInLastRun = [];

  for (let i = 0; i < batches.length; i++) {
    const batchToProcess = batches[i];
    const parentTokenIdsInThisBatch = batchToProcess.map((b) =>
      b.tokenId.toString()
    );

    const batchDetail: BatchAttemptDetail = {
      batchIndex: i,
      parentTokenIdsAttempted: parentTokenIdsInThisBatch,
      success: false,
      attemptTimestamp: Date.now(),
    };
    // Add to current run's details. If resuming, old details are already in progress.batchAttemptDetails
    progress.batchAttemptDetails.push(batchDetail);

    const currentBatchDisplayIndex = i + 1;
    console.log(
      `Processing batch ${currentBatchDisplayIndex}/${
        batches.length
      } (Parent Token IDs: ${parentTokenIdsInThisBatch.join(", ")})...`
    );

    const success = await processBatch(contract, batchToProcess, batchDetail);

    if (success) {
      parentTokenIdsInThisBatch.forEach((tokenId) =>
        progress.processedParentTokenIds.add(tokenId)
      );
    } else {
      progress.failedParentTokenIdBatchesInLastRun.push(i);
    }

    progress.lastProcessedParentTokenIdBatchIndexInLastRun = i;
    saveProgress(progress); // Save after each batch
    printAnalytics(progress, batches.length);
  }

  console.log("\n=== Final Results for setting Aavegotchi ERC998 data ===");
  printAnalytics(progress, batches.length);
  if (progress.failedParentTokenIdBatchesInLastRun.length > 0) {
    console.warn(
      `Some batches failed. Check failedParentTokenIdBatchesInLastRun and batchAttemptDetails in ${PROGRESS_FILE}`
    );
  }
  console.log("Script finished.");
}

if (require.main === module) {
  setAavegotchi998DataScript()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
