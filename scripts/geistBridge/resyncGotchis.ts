import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { BigNumber } from "ethers";
import { AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { DATA_PATH, PROCESSED_PATH } from "./paths";

// === Configuration ===
const BATCH_SIZE = 2500;
const MAX_RETRIES = 3; // Number of retries, so 1 initial attempt + 3 retries = 4 total attempts
const RETRY_DELAY_MS = 3000; // 3 seconds
const aavegotchiMetadataPath = path.join(
  DATA_PATH,
  "aavegotchi",
  "metadata",
  "aavegotchiMetadata.json"
);

// Interface describing the relevant fields from the raw aavegotchiMetadata.json file
interface RawAavegotchiMetadata {
  status: number;
  // Other properties from the JSON exist, but we only need status for filtering.
}

// === Helper Functions ===

function loadAndFilterGotchiIds(): string[] {
  console.log(`Loading metadata from: ${aavegotchiMetadataPath}`);
  if (!fs.existsSync(aavegotchiMetadataPath)) {
    console.error(
      `Error: Metadata file not found at ${aavegotchiMetadataPath}`
    );
    process.exit(1);
  }

  try {
    const fileContent = fs.readFileSync(aavegotchiMetadataPath, "utf8");
    // Parse the JSON with our defined type for the values in the record
    const metadataObject: Record<string, RawAavegotchiMetadata> =
      JSON.parse(fileContent);

    const idsToResync: string[] = [];
    for (const gotchiId in metadataObject) {
      if (Object.prototype.hasOwnProperty.call(metadataObject, gotchiId)) {
        const gotchiData = metadataObject[gotchiId];
        // Check for status === 3 (portal opened, gotchi summoned)
        if (gotchiData && gotchiData.status === 3) {
          idsToResync.push(gotchiId);
        }
      }
    }

    console.log(`Found ${idsToResync.length} Gotchis with status 3 to resync.`);
    return idsToResync;
  } catch (error: any) {
    console.error(`Error reading or parsing metadata file: ${error.message}`);
    process.exit(1);
  }
}

async function resyncGotchisInBatches() {
  console.log("Starting Aavegotchi resync script for Gotchis with status 3...");

  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  const signerAddress = await signer.getAddress();
  console.log(`Using relayer signer: ${signerAddress}`);

  const network = await ethers.provider.getNetwork();
  console.log(
    `Operating on network: ${network.name} (chainId: ${network.chainId})`
  );

  const c = await varsForNetwork(ethers);
  if (!c.aavegotchiDiamond) {
    throw new Error("Aavegotchi Diamond address not found for this network.");
  }

  const bridgeFacet = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond,
    signer
  )) as AavegotchiBridgeFacet;
  console.log(`Attached to AavegotchiBridgeFacet at ${bridgeFacet.address}`);

  const allGotchiIds = loadAndFilterGotchiIds();

  if (allGotchiIds.length === 0) {
    console.log("No Gotchis with status 3 found to resync. Exiting.");
    return;
  }

  console.log(`found ${allGotchiIds.length} gotchis to resync`);

  const totalBatches = Math.ceil(allGotchiIds.length / BATCH_SIZE);
  console.log(
    `Total Gotchi IDs to process: ${allGotchiIds.length}, in ${totalBatches} batches of up to ${BATCH_SIZE}.`
  );

  let totalSuccessfullyResyncedCount = 0;
  const failedBatchIndexes: number[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const batchStart = i * BATCH_SIZE;
    const batchEnd = Math.min((i + 1) * BATCH_SIZE, allGotchiIds.length);
    const currentBatchIds = allGotchiIds.slice(batchStart, batchEnd);

    if (currentBatchIds.length === 0) {
      console.log(`Batch ${i + 1}/${totalBatches} is empty, skipping.`);
      continue;
    }

    console.log(`
Processing batch ${i + 1}/${totalBatches} with ${
      currentBatchIds.length
    } Gotchis.`);

    const batchBigNumberIds = currentBatchIds.map((id) => BigNumber.from(id));

    let successInCurrentBatchAttempt = false;
    let attemptError: string | undefined;
    let txHash: string | undefined;

    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        console.log(
          `  Attempt ${retry + 1}/${MAX_RETRIES + 1} for batch ${i + 1}...`
        );
        const tx = await bridgeFacet.resyncAavegotchis(batchBigNumberIds);
        txHash = tx.hash;
        console.log(
          `  Transaction sent for batch ${
            i + 1
          }: ${txHash}. Waiting for confirmation...`
        );
        await tx.wait(1);
        console.log(`  Batch ${i + 1} successfully resynced.`);
        successInCurrentBatchAttempt = true;
        attemptError = undefined;
        totalSuccessfullyResyncedCount += currentBatchIds.length;
        break;
      } catch (error: any) {
        attemptError = error.message || JSON.stringify(error);
        console.error(
          `  Error resyncing batch ${i + 1}, attempt ${
            retry + 1
          }: ${attemptError}`
        );
        if (retry < MAX_RETRIES) {
          console.log(`  Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          console.error(
            `  Batch ${i + 1} failed after ${MAX_RETRIES + 1} attempts.`
          );
          failedBatchIndexes.push(i);
        }
      }
    }
  } // End of batches loop

  console.log(`
Resync script finished.`);
  console.log(
    `Total Gotchis successfully resynced: ${totalSuccessfullyResyncedCount} out of ${allGotchiIds.length}.`
  );
  if (failedBatchIndexes.length > 0) {
    console.warn(
      `The following batch indexes (0-indexed) failed all retry attempts: ${failedBatchIndexes.join(
        ", "
      )}`
    );
    failedBatchIndexes.forEach((batchIndex) => {
      const startIdInFailedBatch = allGotchiIds[batchIndex * BATCH_SIZE];
      const endIdIndexInFailedBatch = Math.min(
        (batchIndex + 1) * BATCH_SIZE - 1,
        allGotchiIds.length - 1
      );
      const endIdInFailedBatch = allGotchiIds[endIdIndexInFailedBatch];
      console.warn(
        `  - Failed Batch (index ${batchIndex}): Contained IDs from approximately ${startIdInFailedBatch} to ${endIdInFailedBatch}`
      );
    });
  } else {
    console.log("All batches processed successfully.");
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(
        "Unhandled error in main execution:",
        error.stack || error.message || error
      );
      process.exit(1);
    });
}

async function main() {
  await resyncGotchisInBatches();
}
