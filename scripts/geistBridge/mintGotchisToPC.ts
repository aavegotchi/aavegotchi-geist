import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { PC_WALLET } from "./paths";

const DATA_PATH = path.join(__dirname, "cloneData/aavegotchi");
const WITH_EOA_FILE = path.join(DATA_PATH, "aavegotchi-contractsWithEOA.json");
const WITHOUT_EOA_FILE = path.join(
  DATA_PATH,
  "aavegotchi-contractsWithoutEOAs.json"
);
const GBM_FILE = path.join(DATA_PATH, "aavegotchi-gbmDiamond.json");

type OwnerData = { [ownerAddress: string]: string[] };

async function main() {
  console.log("--- Starting temporary script to mint remaining Gotchis ---");

  let ownersToMint: OwnerData = {};

  // Load data from aavegotchi-contractsWithoutEOAs.json
  if (fs.existsSync(WITHOUT_EOA_FILE)) {
    console.log(`Reading from ${WITHOUT_EOA_FILE}...`);
    const withoutEoaData: OwnerData = JSON.parse(
      fs.readFileSync(WITHOUT_EOA_FILE, "utf8")
    );
    ownersToMint = { ...ownersToMint, ...withoutEoaData };
  } else {
    console.log(`File not found: ${WITHOUT_EOA_FILE}. Skipping.`);
  }

  // Load data from aavegotchi-contractsWithEOA.json
  if (fs.existsSync(WITH_EOA_FILE)) {
    console.log(`Reading from ${WITH_EOA_FILE}...`);
    try {
      const withEoaContent = fs.readFileSync(WITH_EOA_FILE, "utf8");
      const withEoaData = JSON.parse(withEoaContent);
      // Ensure it's an object, not an array, before merging
      if (
        typeof withEoaData === "object" &&
        !Array.isArray(withEoaData) &&
        withEoaData !== null
      ) {
        ownersToMint = { ...ownersToMint, ...withEoaData };
      } else {
        console.log(
          `Data in ${WITH_EOA_FILE} is not in the expected format (object/dictionary). Skipping.`
        );
      }
    } catch (e) {
      console.error(`Error parsing ${WITH_EOA_FILE}. Skipping.`);
    }
  } else {
    console.log(`File not found: ${WITH_EOA_FILE}. Skipping.`);
  }

  // Load tokenIds from aavegotchi-gbmDiamond.json
  let gbmTokenIds: string[] = [];
  if (fs.existsSync(GBM_FILE)) {
    console.log(`Reading from ${GBM_FILE}...`);
    try {
      const gbmContent = fs.readFileSync(GBM_FILE, "utf8");
      const gbmData = JSON.parse(gbmContent);
      if (Array.isArray(gbmData)) {
        gbmTokenIds = gbmData;
      } else {
        console.log(
          `Data in ${GBM_FILE} is not in the expected format (array). Skipping.`
        );
      }
    } catch (e) {
      console.error(`Error parsing ${GBM_FILE}. Skipping.`);
    }
  } else {
    console.log(`File not found: ${GBM_FILE}. Skipping.`);
  }

  // Collect all tokenIds across all owners
  const allTokenIds: string[] = [];
  for (const tokens of Object.values(ownersToMint)) {
    allTokenIds.push(...tokens);
  }
  // Include GBM Diamond tokenIds
  allTokenIds.push(...gbmTokenIds);

  if (allTokenIds.length === 0) {
    console.log("No Aavegotchis found in data files. Exiting.");
    return;
  }

  console.log(
    `Found ${allTokenIds.length} unique Aavegotchis to mint to PC_WALLET.`
  );

  // Ensure uniqueness to prevent double-mints
  const uniqueTokenIds = Array.from(new Set(allTokenIds));

  const c = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);

  const aavegotchiFacet = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond!,
    signer
  )) as AavegotchiBridgeFacet;

  try {
    const tx = await aavegotchiFacet.mintAavegotchiBridged([
      {
        owner: PC_WALLET,
        tokenIds: uniqueTokenIds,
      },
    ]);
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log(
      `✅ Successfully minted ${uniqueTokenIds.length} Aavegotchis to PC_WALLET (${PC_WALLET})`
    );
  } catch (error: any) {
    console.error(`❌ FAILED to mint to PC_WALLET:`, error.message || error);
  }

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
