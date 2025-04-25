import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { BigNumber } from "ethers";
import { AavegotchiBridgeFacet, AavegotchiFacet } from "../../typechain";
import { maticDiamondAddress } from "../helperFunctions";

interface AavegotchiInfo {
  name: string;
  owner: string;
  randomNumber: BigNumber;
  status: number;
  numericTraits: number[];
  temporaryTraitBoosts: number[];
  equippedWearables: number[];
  collateralType: string;
  escrow: string;
  minimumStake: BigNumber;
  usedSkillPoints: BigNumber;
  experience: BigNumber;
  interactionCount: BigNumber;
  claimTime: number;
  lastTemporaryBoost: number;
  hauntId: number;
  lastInteracted: number;
  locked: boolean;
  items: number[];
  respecCount: number;
}

interface MetadataProgress {
  processedCount: number;
  failedBatches: number[];
  startTime: number;
  processedTokenIds: string[];
}

const BATCH_SIZE = 1000;
export const AAVEGOTCHI_DIR = `${__dirname}/aavegotchi/`;
export const PROCESSED_AAVEGOTCHI_DIR = `${AAVEGOTCHI_DIR}/processed`;

const METADATA_FILE = `${AAVEGOTCHI_DIR}/aavegotchiMetadata.json`;
const PROGRESS_FILE = `${PROCESSED_AAVEGOTCHI_DIR}/metadata-progress.json`;

function printAnalytics(
  progress: MetadataProgress,
  totalTokens: number,
  batchNumber: number,
  totalBatches: number
) {
  const timeElapsed = Date.now() - progress.startTime;
  const successRate = (progress.processedTokenIds.length / totalTokens) * 100;

  console.log("\n=== Metadata Update Analytics ===");
  console.log(`Batch ${batchNumber}/${totalBatches}`);
  console.log(
    `Processed Tokens: ${progress.processedTokenIds.length}/${totalTokens}`
  );
  console.log(`Failed Batches: ${progress.failedBatches.length}`);
  console.log(`Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`Time Elapsed: ${(timeElapsed / 1000 / 60).toFixed(2)} minutes`);
  console.log(
    `Average Time per Token: ${(
      timeElapsed /
      progress.processedTokenIds.length /
      1000
    ).toFixed(2)} seconds`
  );
  console.log("================================\n");
}

async function setAavegotchiMetadata() {
  const progress: MetadataProgress = {
    processedCount: 0,
    failedBatches: [],
    startTime: Date.now(),
    processedTokenIds: [],
  };

  // Load metadata
  const metadata: Record<string, AavegotchiInfo> = JSON.parse(
    fs.readFileSync(METADATA_FILE, "utf8")
  );

  // Get contract
  const contract = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    maticDiamondAddress
  )) as AavegotchiBridgeFacet;

  // Load progress
  let processedTokenIds: string[] = [];
  try {
    processedTokenIds = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch (error) {
    // File doesn't exist yet, create it
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify([]));
  }

  // Create batches from unprocessed token IDs
  const unprocessedTokenIds = Object.keys(metadata).filter(
    (id) => !processedTokenIds.includes(id)
  );

  console.log(`Setting metadata for ${unprocessedTokenIds.length} Aavegotchis`);

  const totalTokens = Object.keys(metadata).length;
  const totalBatches = Math.ceil(totalTokens / BATCH_SIZE);

  for (let i = 0; i < unprocessedTokenIds.length; i += BATCH_SIZE) {
    const batchTokenIds = unprocessedTokenIds.slice(i, i + BATCH_SIZE);
    const batchMetadata = batchTokenIds.map((id) => ({
      ...metadata[id],
      // Convert BigNumber fields from strings
      randomNumber: BigNumber.from(metadata[id].randomNumber),
      minimumStake: BigNumber.from(metadata[id].minimumStake),
      usedSkillPoints: BigNumber.from(metadata[id].usedSkillPoints),
      experience: BigNumber.from(metadata[id].experience),
      interactionCount: BigNumber.from(metadata[id].interactionCount),
    }));

    console.log(`Processing batch ${i / BATCH_SIZE + 1}`);

    try {
      // const tx = await contract.setMetadata(
      //   batchTokenIds.map(Number),
      //   batchMetadata
      // );
      // await tx.wait();

      // Update progress
      progress.processedTokenIds.push(...batchTokenIds);
      fs.writeFileSync(
        PROGRESS_FILE,
        JSON.stringify(progress.processedTokenIds)
      );

      console.log(`Successfully processed ${batchTokenIds.length} Aavegotchis`);
    } catch (error) {
      progress.failedBatches.push(i / BATCH_SIZE);
      console.error(`Error processing batch:`, error);
    }

    // Print batch analytics
    printAnalytics(
      progress,
      totalTokens,
      Math.floor(i / BATCH_SIZE) + 1,
      totalBatches
    );
  }

  // Final analytics
  console.log("\n=== Final Update Results ===");
  console.log(
    `Total Tokens Processed: ${progress.processedTokenIds.length}/${totalTokens}`
  );
  console.log(`Failed Batches: ${progress.failedBatches.join(", ") || "None"}`);
  console.log(
    `Total Time: ${((Date.now() - progress.startTime) / 1000 / 60).toFixed(
      2
    )} minutes`
  );
  console.log("============================");
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
