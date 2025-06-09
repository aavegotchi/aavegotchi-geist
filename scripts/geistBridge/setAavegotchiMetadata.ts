import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { BigNumber, BigNumberish } from "ethers";
import { AavegotchiBridgeFacet } from "../../typechain";
import { getRelayerSigner } from "../helperFunctions";
import { varsForNetwork } from "../../helpers/constants";
import { PROCESSED_PATH, DATA_PATH } from "./paths";

// === Configuration ===
//TO-DO: decrease for mainnet as each txn uses 40m gas
const BATCH_SIZE = 50; // Number of Aavegotchis per metadata set transaction
const MAX_RETRIES = 3;
const METADATA_FILE = path.join(
  DATA_PATH,
  "aavegotchi",
  "metadata",
  "aavegotchiMetadata.json"
);
const PROGRESS_FILE = path.join(PROCESSED_PATH, "metadata-progress.json");
// =====================

interface AavegotchiInfo {
  name: string;
  owner: string;
  randomNumber: string;
  status: number;
  numericTraits: number[];
  temporaryTraitBoosts: number[];
  equippedWearables: number[];
  collateralType: string;
  escrow: string;
  minimumStake: string;
  usedSkillPoints: string;
  experience: string;
  interactionCount: string;
  claimTime: number;
  lastTemporaryBoost: number;
  hauntId: number;
  lastInteracted: number;
  locked: boolean;
  items: number[];
  respecCount: number;
  baseRandomNumber: string;
}

// Specific type for contract.setMetadata
interface AavegotchiMetadataInputForContract {
  name: string;
  owner: string;
  randomNumber: BigNumber;
  status: number;
  numericTraits: [
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber
  ];
  temporaryTraitBoosts: [
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber
  ];
  equippedWearables: [
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber
  ];
  collateralType: string;
  escrow: string;
  minimumStake: BigNumber;
  usedSkillPoints: BigNumber;
  experience: BigNumber;
  interactionCount: BigNumber;
  claimTime: BigNumber;
  lastTemporaryBoost: BigNumber;
  hauntId: BigNumber;
  lastInteracted: BigNumber;
  locked: boolean;
  respecCount: BigNumber;
  baseRandomNumber: BigNumber;
}

interface BatchDetail {
  batchIndex: number; // 0-indexed, corresponds to the attempt order in a run
  tokenIds: string[];
  success: boolean;
  attemptTimestamp: number;
}

interface MetadataProgress {
  startTime: number; // Overall start time of the script execution (first run)
  processedTokenIds: string[]; // Cumulative list of successfully processed token IDs across all runs
  failedBatchIndexes: number[]; // List of 0-indexed batch numbers that failed in the LATEST run after all retries
  batchDetails: BatchDetail[]; // Detailed log of each batch attempt across all runs
}

async function loadProgress(): Promise<MetadataProgress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    const parsedData = JSON.parse(data);

    if (Array.isArray(parsedData)) {
      // Very old format (just an array of token IDs)
      console.log(
        "Oldest progress file format (array of IDs) detected. Migrating..."
      );
      return {
        startTime: Date.now(),
        processedTokenIds: parsedData as string[],
        failedBatchIndexes: [],
        batchDetails: [],
      };
    }

    // Check for format that had failedBatchNumbers but not batchDetails
    if (parsedData.failedBatchNumbers && !parsedData.batchDetails) {
      console.log(
        "Old progress file format (with failedBatchNumbers) detected. Migrating..."
      );
      return {
        startTime: parsedData.startTime || Date.now(),
        processedTokenIds: parsedData.processedTokenIds || [],
        failedBatchIndexes: parsedData.failedBatchNumbers || [], // Rename field
        batchDetails: [], // Initialize new field
      };
    }

    // Modern format, provide defaults for all fields
    return {
      startTime: parsedData.startTime || Date.now(),
      processedTokenIds: parsedData.processedTokenIds || [],
      failedBatchIndexes:
        parsedData.failedBatchIndexes || parsedData.failedBatchNumbers || [], // Handle potential old field name
      batchDetails: parsedData.batchDetails || [],
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("Metadata progress file not found. Starting fresh.");
      return {
        startTime: Date.now(),
        processedTokenIds: [],
        failedBatchIndexes: [],
        batchDetails: [],
      };
    } else {
      console.error("Error loading metadata progress file:", error);
      throw error;
    }
  }
}

function saveProgress(progress: MetadataProgress) {
  const tempProgressFile = PROGRESS_FILE + ".tmp";
  try {
    fs.writeFileSync(tempProgressFile, JSON.stringify(progress, null, 2));
    fs.renameSync(tempProgressFile, PROGRESS_FILE);
  } catch (error) {
    console.error("Error saving metadata progress:", error);
    if (fs.existsSync(tempProgressFile)) {
      try {
        fs.unlinkSync(tempProgressFile);
      } catch (cleanupError) {
        console.error(
          "Error cleaning up temp metadata progress file:",
          cleanupError
        );
      }
    }
  }
}

function printAnalytics(
  progress: MetadataProgress,
  totalTokensToProcessInitially: number, // Total tokens that needed processing at script start
  currentBatchNumber: number, // 1-indexed
  totalBatchesToProcessInitially: number // Total batches that needed processing at script start
) {
  const timeElapsed = Date.now() - progress.startTime;
  const successRate =
    progress.processedTokenIds.length > 0
      ? (progress.processedTokenIds.length /
          (progress.processedTokenIds.length +
            progress.failedBatchIndexes.length * BATCH_SIZE)) * // Approximate total attempted tokens
        100
      : 0;

  console.log("\n=== Metadata Update Analytics ===");
  console.log(
    `Batch ${currentBatchNumber}/${totalBatchesToProcessInitially} (based on initial unprocessed count)`
  );
  console.log(
    `Processed Tokens in this run: ${progress.processedTokenIds.length}`
  );
  console.log(
    `Total Processed Tokens (including previous runs): ${progress.processedTokenIds.length}`
  );
  console.log(
    `Failed Batches in this run: ${progress.failedBatchIndexes.length}`
  );
  console.log(`Success Rate (approximate): ${successRate.toFixed(2)}%`);
  console.log(`Time Elapsed: ${(timeElapsed / 1000 / 60).toFixed(2)} minutes`);
  if (progress.processedTokenIds.length > 0) {
    console.log(
      `Average Time per Token (this run): ${(
        timeElapsed /
        progress.processedTokenIds.length /
        1000
      ).toFixed(2)} seconds`
    );
  }
  console.log("================================\n");
}

async function processBatchAttempt(
  contract: AavegotchiBridgeFacet,
  batchTokenIds: string[],
  batchMetadata: AavegotchiMetadataInputForContract[],
  currentBatchIndex: number // 0-indexed
): Promise<boolean> {
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      console.log(
        `Attempting to set metadata for batch ${currentBatchIndex + 1}, try ${
          retry + 1
        }/${MAX_RETRIES}`
      );

      const tx = await contract.setMetadata(
        batchTokenIds.map(Number), // Assuming token IDs are numeric and contract expects numbers
        batchMetadata
      );

      console.log(
        `Successfully processed batch ${currentBatchIndex + 1} with ${
          batchTokenIds.length
        } Aavegotchis`
      );
      return true; // Success
    } catch (error: any) {
      console.error(
        `Error processing batch ${currentBatchIndex + 1} on try ${retry + 1}:`,
        error.message || error
      );
      if (retry === MAX_RETRIES - 1) {
        console.error(
          `Batch ${currentBatchIndex + 1} failed after ${MAX_RETRIES} retries.`
        );
        return false; // Max retries reached
      }
      // Optional: add a delay before retrying
      // await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false; // Should not be reached if MAX_RETRIES > 0
}

async function setAavegotchiMetadata() {
  // Ensure output directory exists
  if (!fs.existsSync(PROCESSED_PATH)) {
    fs.mkdirSync(PROCESSED_PATH, { recursive: true });
  }

  const progress = await loadProgress();

  // Load metadata from file
  let allMetadata: Record<string, AavegotchiInfo>;
  try {
    allMetadata = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
  } catch (error: any) {
    console.error(
      `Failed to load or parse metadata file from ${METADATA_FILE}:`,
      error
    );
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

  // Determine unprocessed token IDs
  const processedTokenIdsSet = new Set(progress.processedTokenIds);
  const unprocessedTokenIds = Object.keys(allMetadata).filter(
    (id) => !processedTokenIdsSet.has(id)
  );

  if (unprocessedTokenIds.length === 0) {
    console.log(
      "All Aavegotchis already have metadata set according to progress file."
    );
    // Print final analytics based on loaded progress and total metadata
    printAnalytics(progress, Object.keys(allMetadata).length, 0, 0);
    return;
  }

  console.log(
    `Setting metadata for ${unprocessedTokenIds.length} Aavegotchis (out of ${
      Object.keys(allMetadata).length
    } total).`
  );

  const totalTokensToProcessInitially = unprocessedTokenIds.length;
  const totalBatchesToProcessInitially = Math.ceil(
    unprocessedTokenIds.length / BATCH_SIZE
  );

  // Clear failedBatchIndexes for the current run, as we are reprocessing or processing new ones.
  // Old permanent failures are implicitly part of unprocessedTokenIds.
  // batchDetails will accumulate history across runs.
  progress.failedBatchIndexes = [];

  let firstItemLogged = false; // Debug flag

  for (let i = 0; i < unprocessedTokenIds.length; i += BATCH_SIZE) {
    const currentBatchIndex = Math.floor(i / BATCH_SIZE);
    const batchTokenIds = unprocessedTokenIds.slice(i, i + BATCH_SIZE);
    const batchMetadata: AavegotchiMetadataInputForContract[] =
      batchTokenIds.map((id) => {
        const metadataItem = allMetadata[id];
        const equippedWearablesPadded: [
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber
        ] = new Array(16).fill(BigNumber.from(0)) as any;
        if (Array.isArray(metadataItem.equippedWearables)) {
          for (
            let j = 0;
            j < Math.min(metadataItem.equippedWearables.length, 16);
            j++
          ) {
            equippedWearablesPadded[j] = BigNumber.from(
              metadataItem.equippedWearables[j]
            );
          }
        }

        const temporaryTraitBoostsPadded: [
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber
        ] = new Array(6).fill(BigNumber.from(0)) as any;
        if (Array.isArray(metadataItem.temporaryTraitBoosts)) {
          for (
            let j = 0;
            j < Math.min(metadataItem.temporaryTraitBoosts.length, 6);
            j++
          ) {
            temporaryTraitBoostsPadded[j] = BigNumber.from(
              metadataItem.temporaryTraitBoosts[j]
            );
          }
        }

        const numericTraitsPadded: [
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber,
          BigNumber
        ] = new Array(6).fill(BigNumber.from(0)) as any;
        if (Array.isArray(metadataItem.numericTraits)) {
          for (
            let j = 0;
            j < Math.min(metadataItem.numericTraits.length, 6);
            j++
          ) {
            numericTraitsPadded[j] = BigNumber.from(
              metadataItem.numericTraits[j]
            );
          }
        }

        const mappedItem: AavegotchiMetadataInputForContract = {
          name: metadataItem.name,
          owner: metadataItem.owner,
          randomNumber: BigNumber.from(metadataItem.randomNumber),
          status: metadataItem.status,
          numericTraits: numericTraitsPadded,
          temporaryTraitBoosts: temporaryTraitBoostsPadded,
          equippedWearables: equippedWearablesPadded,
          collateralType: metadataItem.collateralType,
          escrow: metadataItem.escrow,
          minimumStake: BigNumber.from(metadataItem.minimumStake),
          usedSkillPoints: BigNumber.from(metadataItem.usedSkillPoints),
          experience: BigNumber.from(metadataItem.experience),
          interactionCount: BigNumber.from(metadataItem.interactionCount),
          claimTime: BigNumber.from(metadataItem.claimTime),
          lastTemporaryBoost: BigNumber.from(metadataItem.lastTemporaryBoost),
          hauntId: BigNumber.from(metadataItem.hauntId),
          lastInteracted: BigNumber.from(metadataItem.lastInteracted),
          //we make sure all aavegotchis are unlocked
          locked: false,
          respecCount: BigNumber.from(metadataItem.respecCount),
          baseRandomNumber: BigNumber.from(metadataItem.baseRandomNumber),
        };

        // if (!firstItemLogged) {
        //   console.log("\n--- DEBUG: First item raw metadata (from JSON) ---");
        //   console.log(JSON.stringify(metadataItem, null, 2));
        //   console.log(
        //     "--- DEBUG: First item mapped metadata (for contract) ---"
        //   );
        //   console.log(
        //     JSON.stringify(
        //       mappedItem,
        //       (key, value) =>
        //         typeof value === "object" &&
        //         value !== null &&
        //         value._isBigNumber
        //           ? value.toString()
        //           : value,
        //       2
        //     )
        //   );
        //   console.log(
        //     "-----------------------------------------------------\n"
        //   );
        //   firstItemLogged = true;
        // }
        return mappedItem;
      });

    console.log(
      `Processing batch ${
        currentBatchIndex + 1
      }/${totalBatchesToProcessInitially} (Token IDs: ${batchTokenIds.join(
        ", "
      )})`
    );

    const success = await processBatchAttempt(
      contract,
      batchTokenIds,
      batchMetadata,
      currentBatchIndex
    );

    // Add to batchDetails log for this run
    // The batchIndex here refers to its order in this specific execution run of unprocessed items.
    // If you need a globally unique batch ID across script executions, that would be more complex.
    progress.batchDetails.push({
      batchIndex: currentBatchIndex,
      tokenIds: batchTokenIds,
      success: success,
      attemptTimestamp: Date.now(),
    });

    if (success) {
      // Add to cumulative list of successfully processed token IDs
      progress.processedTokenIds.push(...batchTokenIds);
    } else {
      // Record the index of the failed batch for this run's failed list
      progress.failedBatchIndexes.push(currentBatchIndex);
    }

    // Save progress after every batch attempt
    saveProgress(progress);

    printAnalytics(
      progress,
      totalTokensToProcessInitially,
      currentBatchIndex + 1,
      totalBatchesToProcessInitially
    );
  }

  console.log("\n=== Final Metadata Update Results ===");
  console.log(
    `Total Aavegotchis in metadata file: ${Object.keys(allMetadata).length}`
  );
  console.log(
    `Successfully Processed Token IDs (cumulative): ${progress.processedTokenIds.length}`
  );
  if (progress.failedBatchIndexes.length > 0) {
    console.error(
      `Failed Batch Indexes (0-indexed relative to this run): ${progress.failedBatchIndexes.join(
        ", "
      )}`
    );
    console.log(
      "These batches (and their token IDs) are recorded in batchDetails in the progress file with success:false."
    );
  } else {
    console.log("All batches processed successfully in this run.");
  }
  console.log(
    `Total Time (since first script start): ${(
      (Date.now() - progress.startTime) /
      1000 /
      60
    ).toFixed(2)} minutes`
  );
  console.log("=====================================");
}

// Execute the script
if (require.main === module) {
  setAavegotchiMetadata()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
