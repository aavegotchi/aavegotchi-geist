import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AavegotchiFacet } from "../../typechain";
import { maticDiamondAddress } from "../helperFunctions";

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

const BATCH_SIZE = 500; // Number of mints per transaction
const MAX_RETRIES = 3;
const mintDirGotchi = path.join(__dirname, "aavegotchi", "processed");
const PROGRESS_FILE = path.join(mintDirGotchi, "minting-progress.json");
const AAVEGOTCHI_BALANCE_FILE = `${__dirname}/aavegotchi/aavegotchi-regular.json`;

async function loadProgress(): Promise<MintingProgress> {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return {
      totalProcessed: 0,
      lastBatchIndex: 0,
      failedBatches: [],
      startTime: Date.now(),
      processedAddresses: {},
    };
  }
}

function saveProgress(progress: MintingProgress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function createBatches(aavegotchiData: Record<string, string[]>): MintBatch[] {
  const batches: MintBatch[] = [];
  const entries = Object.entries(aavegotchiData);

  // Batch by number of addresses (not token count)
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batchEntries = entries.slice(i, i + BATCH_SIZE);
    batches.push({
      owners: batchEntries.map(([owner]) => owner),
      tokenIdsByOwner: batchEntries.map(([, tokenIds]) => tokenIds),
    });
  }

  return batches;
}

async function processBatch(
  contract: AavegotchiFacet,
  batch: MintBatch,
  progress: MintingProgress,
  batchIndex: number,
  retryCount = 0
): Promise<boolean> {
  try {
    // const tx = await contract.mintAaavegotchiBridged(
    //   batch.owners.map((owner, i) => ({
    //     owner,
    //     tokenIds: batch.tokenIdsByOwner[i],
    //   }))
    // );
    // await tx.wait();

    // Record successful mint
    batch.owners.forEach((owner, i) => {
      progress.processedAddresses[owner] = {
        tokenIds: batch.tokenIdsByOwner[i],
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
  // Create directory if it doesn't exist
  if (!fs.existsSync(mintDirGotchi)) {
    fs.mkdirSync(mintDirGotchi, { recursive: true });
  }

  const aavegotchiData = JSON.parse(
    fs.readFileSync(AAVEGOTCHI_BALANCE_FILE, "utf8")
  ) as Record<string, string[]>;

  console.log("Loaded Aavegotchi data:");
  console.log(`Total unique owners: ${Object.keys(aavegotchiData).length}`);
  console.log(
    `Total tokens to mint: ${Object.values(aavegotchiData).reduce(
      (acc, curr) => acc + curr.length,
      0
    )}`
  );

  const contract = (await ethers.getContractAt(
    "AavegotchiFacet",
    maticDiamondAddress
  )) as AavegotchiFacet;

  const progress = await loadProgress();
  const batches = createBatches(aavegotchiData);

  console.log(`Starting minting process with ${batches.length} batches`);
  console.log(`Continuing from batch ${progress.lastBatchIndex}`);

  for (let i = progress.lastBatchIndex; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} for owner ${batch.owners[0]}`
    );

    const success = await processBatch(contract, batch, progress, i);
    progress.totalProcessed++;
    progress.lastBatchIndex = i + 1;

    if (!success) {
      progress.failedBatches.push(i);
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
