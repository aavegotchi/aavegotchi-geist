import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AavegotchiBridgeFacet } from "../../typechain";
import { getRelayerSigner } from "../helperFunctions";
import { varsForNetwork } from "../../helpers/constants";
import { DATA_PATH, PROCESSED_PATH } from "./paths";

// === Configuration ===
const MAX_RETRIES = 3;

const PROGRESS_FILE = path.join(
  PROCESSED_PATH,
  "aavegotchi_minting_progress.json"
);
const AAVEGOTCHI_BALANCE_FILE = path.join(
  DATA_PATH,
  "aavegotchi",
  "aavegotchi-regular.json"
);

interface MintingProgress {
  totalProcessed: number;
  lastBatchIndex: number;
  failedBatches: number[];
  startTime: number;
  processedAddresses: {
    [address: string]: {
      tokenIds: string[];
      timestamp: number;
    };
  };
}

interface MintBatch {
  owners: string[];
  tokenIdsByOwner: string[][];
}

// Helper: split a failed batch into two smaller batches
function splitBatch(batch: MintBatch): MintBatch[] {
  // If more than one owner, split by owners
  if (batch.owners.length > 1) {
    const mid = Math.floor(batch.owners.length / 2);
    return [
      {
        owners: batch.owners.slice(0, mid),
        tokenIdsByOwner: batch.tokenIdsByOwner.slice(0, mid),
      },
      {
        owners: batch.owners.slice(mid),
        tokenIdsByOwner: batch.tokenIdsByOwner.slice(mid),
      },
    ];
  }

  // Single owner but many tokenIds – split that owner's tokens
  const owner = batch.owners[0];
  const tokens = batch.tokenIdsByOwner[0];
  const midTok = Math.floor(tokens.length / 2);
  return [
    {
      owners: [owner],
      tokenIdsByOwner: [tokens.slice(0, midTok)],
    },
    {
      owners: [owner],
      tokenIdsByOwner: [tokens.slice(midTok)],
    },
  ];
}

async function loadProgress(): Promise<MintingProgress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("Progress file not found. Starting fresh.");
      return {
        totalProcessed: 0,
        lastBatchIndex: 0,
        failedBatches: [],
        startTime: Date.now(),
        processedAddresses: {},
      };
    } else {
      console.error("Error loading progress file:", error);
      throw error; // Re-throw other errors
    }
  }
}

function saveProgress(progress: MintingProgress) {
  const tempProgressFile = PROGRESS_FILE + ".tmp";
  try {
    fs.writeFileSync(tempProgressFile, JSON.stringify(progress, null, 2));
    fs.renameSync(tempProgressFile, PROGRESS_FILE);
  } catch (error) {
    console.error("Error saving progress:", error);
    // If rename failed, try to clean up the temp file
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
  aavegotchiData: Record<string, string[]>,
  processedAddresses: MintingProgress["processedAddresses"]
): MintBatch[] {
  const MAX_TOKENS_PER_BATCH = 250;
  const finalBatches: MintBatch[] = [];

  // Step 1: Determine remaining tokens to be processed
  const remainingAavegotchiData: Record<string, string[]> = {};
  let totalTokensToPotentiallyBatch = 0;

  for (const owner in aavegotchiData) {
    if (Object.prototype.hasOwnProperty.call(aavegotchiData, owner)) {
      const allTokensForOwner = aavegotchiData[owner];
      const processedTokenIdsForOwner = new Set(
        processedAddresses[owner]?.tokenIds || []
      );

      const remainingTokensForOwner = allTokensForOwner.filter(
        (tokenId) => !processedTokenIdsForOwner.has(tokenId)
      );

      if (remainingTokensForOwner.length > 0) {
        remainingAavegotchiData[owner] = remainingTokensForOwner;
        totalTokensToPotentiallyBatch += remainingTokensForOwner.length;
      }
    }
  }

  if (totalTokensToPotentiallyBatch === 0) {
    console.log(
      "All tokens from input file are already marked as processed in the progress file."
    );
    return []; // No batches to create
  }
  console.log(
    `Identified ${totalTokensToPotentiallyBatch} tokens remaining to be batched.`
  );

  // Step 2: Apply dynamic batching logic to the remaining tokens
  const ownerEntries = Object.entries(remainingAavegotchiData);

  const tokensBatchedFromRemainingPerOwner: Map<string, number> = new Map();
  let totalTokensPutIntoBatches = 0;

  while (totalTokensPutIntoBatches < totalTokensToPotentiallyBatch) {
    const currentBatchOwners: string[] = [];
    const currentBatchTokenIdsByOwner: string[][] = [];
    let currentBatchTotalTokens = 0;
    const ownersAddedToThisSpecificBatch: Set<string> = new Set();

    for (const [owner, allRemainingTokensForThisOwner] of ownerEntries) {
      if (ownersAddedToThisSpecificBatch.has(owner)) {
        continue;
      }

      const numTokensAlreadyBatchedFromRemaining =
        tokensBatchedFromRemainingPerOwner.get(owner) || 0;

      if (
        numTokensAlreadyBatchedFromRemaining >=
        allRemainingTokensForThisOwner.length
      ) {
        continue;
      }

      const availableTokensFromOwner = allRemainingTokensForThisOwner.slice(
        numTokensAlreadyBatchedFromRemaining
      );
      const remainingSpaceInBatch =
        MAX_TOKENS_PER_BATCH - currentBatchTotalTokens;

      // No need to break if remainingSpaceInBatch <= 0, loop continues to give all owners a chance

      const tokensToIncludeFromThisOwner = availableTokensFromOwner.slice(
        0,
        remainingSpaceInBatch
      );

      if (tokensToIncludeFromThisOwner.length > 0) {
        currentBatchOwners.push(owner);
        currentBatchTokenIdsByOwner.push(tokensToIncludeFromThisOwner);
        ownersAddedToThisSpecificBatch.add(owner);
        currentBatchTotalTokens += tokensToIncludeFromThisOwner.length;
      }
    }

    if (currentBatchOwners.length === 0) {
      if (totalTokensPutIntoBatches < totalTokensToPotentiallyBatch) {
        console.warn(
          `Warning: Could not form a new batch (${
            finalBatches.length + 1
          }), but ${
            totalTokensToPotentiallyBatch - totalTokensPutIntoBatches
          } tokens appear to be unbatched. This might indicate an issue with data or MAX_TOKENS_PER_BATCH limit.`
        );
      }
      break;
    }

    finalBatches.push({
      owners: currentBatchOwners,
      tokenIdsByOwner: currentBatchTokenIdsByOwner,
    });

    for (let i = 0; i < currentBatchOwners.length; i++) {
      const owner = currentBatchOwners[i];
      const numTokensInBatchForOwner = currentBatchTokenIdsByOwner[i].length;
      tokensBatchedFromRemainingPerOwner.set(
        owner,
        (tokensBatchedFromRemainingPerOwner.get(owner) || 0) +
          numTokensInBatchForOwner
      );
    }
    totalTokensPutIntoBatches += currentBatchTotalTokens;
  }

  console.log(
    `Created ${finalBatches.length} batches for the remaining ${totalTokensToPotentiallyBatch} tokens using dynamic strategy.`
  );
  return finalBatches;
}

async function processBatch(
  contract: AavegotchiBridgeFacet,
  batch: MintBatch,
  progress: MintingProgress,
  batchIndex: number,
  retryCount = 0
): Promise<boolean> {
  try {
    console.log(
      `Attempting to mint for ${batch.owners.length} owners in batch ${batchIndex}.`
    );
    const tx = await contract.mintAavegotchiBridged(
      batch.owners.map((owner, i) => ({
        owner,
        tokenIds: batch.tokenIdsByOwner[i],
      }))
    );
    console.log(
      `Transaction sent for batch ${batchIndex}. Waiting for confirmation...`
    );
    const receipt = await ethers.provider.waitForTransaction(tx.hash, 1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(
        `Transaction ${tx.hash} for batch ${batchIndex} reverted on-chain.`
      );
    }
    console.log(`Transaction confirmed for batch ${batchIndex}.`);

    // Record successful mint
    batch.owners.forEach((owner, i) => {
      const lower = owner.toLowerCase();
      const prev = progress.processedAddresses[lower];
      const already: Set<string> = new Set(prev ? prev.tokenIds : []);
      batch.tokenIdsByOwner[i].forEach((id) => already.add(id));
      progress.processedAddresses[lower] = {
        tokenIds: Array.from(already),
        timestamp: Date.now(),
      };
    });

    return true;
  } catch (error: any) {
    console.error(
      `Error processing batch ${batchIndex}:`,
      error.message || error
    );
    if (retryCount < MAX_RETRIES) {
      console.log(
        `Retrying batch ${batchIndex}... (${retryCount + 1}/${MAX_RETRIES})`
      );
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
  const totalTokensMinted = Object.values(progress.processedAddresses).reduce(
    (acc, curr) => acc + curr.tokenIds.length,
    0
  );

  console.log("\n=== Minting Analytics ===");
  console.log(
    `Total Batches Processed: ${progress.totalProcessed}/${totalBatches}`
  );
  console.log(`Failed Batches: ${progress.failedBatches.length}`);
  console.log(`Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`Processed Addresses: ${processedAddressCount}`);
  console.log(`Total Tokens Minted: ${totalTokensMinted}`);
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

export async function mintAavegotchis() {
  const c = await varsForNetwork(ethers);

  let aavegotchiData: Record<string, string[]>;
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  try {
    aavegotchiData = JSON.parse(
      fs.readFileSync(AAVEGOTCHI_BALANCE_FILE, "utf8")
    );
  } catch (error: any) {
    console.error(
      `Failed to load or parse Aavegotchi balance file from ${AAVEGOTCHI_BALANCE_FILE}:`,
      error
    );
    process.exit(1); // Exit if we can't load critical data
  }

  console.log("Loaded Aavegotchi data:");
  console.log(`Total unique owners: ${Object.keys(aavegotchiData).length}`);
  console.log(
    `Total tokens to mint: ${Object.values(aavegotchiData).reduce(
      (acc, curr) => acc + curr.length,
      0
    )}`
  );

  const contract = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond!,
    signer
  )) as AavegotchiBridgeFacet;

  const progress = await loadProgress();
  const batches = createBatches(aavegotchiData, progress.processedAddresses);

  // If all tokens are already processed, batches will be empty.
  if (batches.length === 0) {
    console.log("All tokens have been processed. Nothing to do.");
    printAnalytics(progress, 0); // Print final analytics based on loaded progress
    return; // Exit if no batches to process
  }

  console.log(
    `Starting/resuming minting process with ${batches.length} batches of remaining tokens.`
  );
  if (
    progress.lastBatchIndex > 0 &&
    progress.lastBatchIndex <= batches.length
  ) {
    console.log(`Resuming from batch ${progress.lastBatchIndex} (1-indexed).`);
  } else if (progress.lastBatchIndex > batches.length) {
    console.warn(
      `Warning: lastBatchIndex (${progress.lastBatchIndex}) in progress file is greater than the number of newly generated batches (${batches.length}). Starting from the beginning of new batches.`
    );
    progress.lastBatchIndex = 0; // Reset to start from the beginning of the new batch set
  }

  let i = progress.lastBatchIndex;
  while (i < batches.length) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} for first owner address ${
        batch.owners[0]
      }`
    );

    const success = await processBatch(contract, batch, progress, i);
    if (success) {
      progress.totalProcessed++;
      progress.lastBatchIndex = i + 1; // advance cursor
      // remove any record of previous failure for this index
      const failIdx = progress.failedBatches.indexOf(i);
      if (failIdx !== -1) progress.failedBatches.splice(failIdx, 1);
      i++; // move to next batch
    } else {
      console.warn(`Batch ${i + 1} failed. Will attempt to split and retry.`);
      // avoid infinite loop: if batch size is 1 owner & 1 token, record failure and skip
      const totalTokensInBatch = batch.tokenIdsByOwner.reduce(
        (acc, arr) => acc + arr.length,
        0
      );
      if (totalTokensInBatch === 1) {
        if (!progress.failedBatches.includes(i)) progress.failedBatches.push(i);
        i++; // skip this single-token batch
      } else {
        // split and insert new smaller batches at current position
        const smaller = splitBatch(batch);
        // replace current batch with first half, insert second half right after
        batches.splice(i, 1, smaller[0], smaller[1]);
        console.log(
          `Batch split into two smaller batches. Batches array length now ${batches.length}.`
        );
      }
    }

    saveProgress(progress);
    printAnalytics(progress, batches.length);
  }

  // Final analytics
  console.log("\n=== Final Minting Results ===");
  const totalTokensMinted = Object.values(progress.processedAddresses).reduce(
    (acc, curr) => acc + curr.tokenIds.length,
    0
  );
  console.log(`Total Tokens Minted: ${totalTokensMinted}`);
  console.log(`Failed Batches: ${progress.failedBatches.join(", ") || "None"}`);
  console.log("============================");
}

// Execute the script
if (require.main === module) {
  mintAavegotchis()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
