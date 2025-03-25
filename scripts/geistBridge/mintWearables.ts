import { ethers } from "hardhat";
import fs from "fs";
import { DAOFacet } from "../../typechain";
import { maticDiamondAddress } from "../helperFunctions";
import { PROCESSED_AAVEGOTCHI_DIR } from "./setAavegotchiMetadata";

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

const WEARABLES_DIR = `${__dirname}/wearables/`;
const PROCESSED_WEARABLES_DIR = `${WEARABLES_DIR}/processed/`;

interface WearableBalance {
  tokenId: string;
  balance: number;
}

interface MintBatch {
  owners: string[];
  itemBalances: WearableBalance[][];
}

const BATCH_SIZE = 500; // Number of addresses per batch
const MAX_RETRIES = 3;
const WEARABLES_FILE = `${WEARABLES_DIR}/wearables-regular.json`;
const PROGRESS_FILE = `${PROCESSED_WEARABLES_DIR}wearables-progress.json`;

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
  wearablesData: Record<string, WearableBalance[]>
): MintBatch[] {
  const batches: MintBatch[] = [];
  const entries = Object.entries(wearablesData);

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
  contract: DAOFacet,
  batch: MintBatch,
  progress: MintingProgress,
  batchIndex: number,
  retryCount = 0
): Promise<boolean> {
  try {
    // const tx = await contract.batchMintItems(
    //   batch.owners.map((owner, i) => ({
    //     to: owner,
    //     itemBalances: batch.itemBalances[i]
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

export async function mintWearables() {
  // Create processed directory if it doesn't exist
  if (!fs.existsSync(PROCESSED_WEARABLES_DIR)) {
    fs.mkdirSync(PROCESSED_WEARABLES_DIR, { recursive: true });
  }

  const wearablesData = JSON.parse(fs.readFileSync(WEARABLES_FILE, "utf8"));

  console.log("Loaded Wearables data:");
  console.log(`Total unique owners: ${Object.keys(wearablesData).length}`);
  console.log(
    `Total items to mint: ${Object.values(wearablesData).reduce(
      (acc: number, items: WearableBalance[]) =>
        acc + items.reduce((sum, item) => sum + item.balance, 0),
      0
    )}`
  );

  const contract = (await ethers.getContractAt(
    "DAOFacet",
    maticDiamondAddress
  )) as DAOFacet;
  const progress = await loadProgress();
  const batches = createBatches(wearablesData);

  console.log(`Starting minting process with ${batches.length} batches`);
  console.log(`Continuing from batch ${progress.lastBatchIndex}`);
  console.log(batches[0].itemBalances[1]);

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
  mintWearables()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
