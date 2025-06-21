import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { ForgeFacet, AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { DATA_PATH, PROCESSED_PATH } from "./paths";
import { getRelayerSigner } from "../helperFunctions";
import {
  loadProgress,
  saveProgress,
  ProcessingProgress,
} from "./helpers/progress";

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

interface ItemBalance {
  tokenId: string;
  balance: number;
}

type MintableType = "forge-items" | "wearables";

function getFilePaths(mintableType: MintableType): {
  itemsFile: string;
  progressFile: string;
} {
  if (mintableType === "forge-items") {
    return {
      itemsFile: `${DATA_PATH}/forgeWearables/forgeWearables-forgeDiamond.json`,
      progressFile: path.join(
        PROCESSED_PATH,
        "forge-items-minting-progress.json"
      ),
    };
  } else if (mintableType === "wearables") {
    return {
      itemsFile: `${DATA_PATH}/wearables/wearables-forgeDiamond.json`,
      progressFile: path.join(
        PROCESSED_PATH,
        "forge-wearables-minting-progress.json"
      ),
    };
  }
  throw new Error(`Invalid mintable type: ${mintableType}`);
}

function getDefaultProgress(): ProcessingProgress {
  return {
    totalEntriesInSource: 0,
    processedEntryIds: [],
    lastAttemptedBatchIndex: -1,
    lastSuccessfullyProcessedBatchIndex: -1,
    failedBatchDetails: [],
    currentRunFailedBatchIndexes: [],
    startTime: 0,
    completed: false,
    completedAt: null,
  };
}

async function processMintingForType(mintableType: MintableType) {
  const { itemsFile, progressFile } = getFilePaths(mintableType);
  const logPrefix = `[${mintableType}]`;

  console.log(`${logPrefix} Starting minting script...`);
  console.log(`${logPrefix} Items file: ${itemsFile}`);
  console.log(`${logPrefix} Progress file: ${progressFile}`);

  if (!fs.existsSync(itemsFile)) {
    console.error(`CRITICAL: Items file not found at ${itemsFile}`);
    process.exit(1);
  }

  const c = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);

  const allItems: ItemBalance[] = JSON.parse(
    fs.readFileSync(itemsFile, "utf8")
  );

  let progress = loadProgress(progressFile, getDefaultProgress);
  if (progress.completed) {
    console.log(
      `${logPrefix} Minting already completed on ${new Date(
        progress.completedAt!
      ).toISOString()}. Skipping.`
    );
    return;
  }

  const idKey = "tokenId";

  const itemsToProcess = allItems.filter(
    (item) => !progress.processedEntryIds.includes(item[idKey])
  );

  if (itemsToProcess.length === 0) {
    console.log(`${logPrefix} All items already minted. Marking as complete.`);
    progress.completed = true;
    progress.completedAt = Date.now();
    saveProgress(progressFile, progress);
    return;
  }

  console.log(
    `${logPrefix} Total items to mint in this run: ${itemsToProcess.length}`
  );

  const batches: ItemBalance[][] = [];
  for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
    batches.push(itemsToProcess.slice(i, i + BATCH_SIZE));
  }

  let overallSuccess = true;
  progress.currentRunFailedBatchIndexes = [];

  for (
    let i = progress.lastSuccessfullyProcessedBatchIndex + 1;
    i < batches.length;
    i++
  ) {
    const batch = batches[i];
    const batchEntryIds = batch.map((item) => item[idKey]);
    progress.lastAttemptedBatchIndex = i;

    console.log(
      `${logPrefix} Processing batch ${i + 1}/${batches.length} with ${
        batch.length
      } items.`
    );

    let successInCurrentBatchAttempt = false;
    let attemptError: string | undefined;

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        let tx;
        /*
        // === Forge-items minting (currently disabled) ===
        if (mintableType === "forge-items") {
          const contract = (await ethers.getContractAt(
            "ForgeFacet",
            c.forgeDiamond!,
            signer
          )) as ForgeFacet;
          tx = await contract.batchMintForgeItems([
            {
              to: c.forgeDiamond!,
              itemBalances: batch.map((item) => ({
                itemId: ethers.BigNumber.from(item.tokenId),
                quantity: item.balance,
              })),
            },
          ]);
        } else {
        */
        // === Wearables minting ===
        const contract = (await ethers.getContractAt(
          "AavegotchiBridgeFacet",
          c.aavegotchiDiamond!,
          signer
        )) as AavegotchiBridgeFacet;

        tx = await contract.batchMintItems([
          {
            to: c.forgeDiamond!,
            itemBalances: batch.map((item) => ({
              itemId: ethers.BigNumber.from(item.tokenId),
              quantity: item.balance,
            })),
          },
        ]);
        // }

        console.log(
          `${logPrefix} Batch ${i + 1} transaction sent: ${
            tx.hash
          }. Waiting for confirmation...`
        );
        await tx.wait();
        console.log(`${logPrefix} Batch ${i + 1} transaction confirmed.`);
        successInCurrentBatchAttempt = true;
        break;
      } catch (error: any) {
        attemptError = error.message || JSON.stringify(error);
        console.error(
          `${logPrefix} Error processing batch ${i + 1}, attempt ${
            retry + 1
          }/${MAX_RETRIES}: `,
          attemptError
        );
        if (retry < MAX_RETRIES - 1) {
          console.log(
            `${logPrefix} Retrying in ${RETRY_DELAY_MS / 1000} seconds...`
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    if (successInCurrentBatchAttempt) {
      progress.processedEntryIds.push(...batchEntryIds);
      progress.lastSuccessfullyProcessedBatchIndex = i;
    } else {
      progress.failedBatchDetails.push({
        batchIndex: i,
        attemptTimestamp: Date.now(),
        success: false,
        error: attemptError,
        entryIdsInBatch: batchEntryIds,
      });
      progress.currentRunFailedBatchIndexes.push(i);
      overallSuccess = false;
    }
    saveProgress(progressFile, progress);
  }

  if (overallSuccess) {
    console.log(`${logPrefix} All batches processed successfully.`);
    progress.completed = true;
    progress.completedAt = Date.now();
  } else {
    console.error(
      `${logPrefix} Minting finished with some failed batches: ${progress.currentRunFailedBatchIndexes.join(
        ", "
      )}`
    );
  }
  saveProgress(progressFile, progress);
}

async function main() {
  console.log("--- Starting Forge and Wearable Minting Script ---");

  console.log("\n[STEP 1] Processing Forge Items...");
  await processMintingForType("forge-items");

  console.log("\n[STEP 2] Processing Wearables...");
  await processMintingForType("wearables");

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
