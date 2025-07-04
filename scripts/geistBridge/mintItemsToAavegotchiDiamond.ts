import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { DATA_PATH, ensureMiscProgress, writeMiscProgress } from "./paths";
import { getRelayerSigner } from "../helperFunctions";

interface ItemBalance {
  tokenId: string;
  balance: number;
}

type MintableType = "gotchis" | "wearables";

function getFilePath(mintableType: MintableType): string {
  if (mintableType === "gotchis") {
    return `${DATA_PATH}/aavegotchi/aavegotchi-aavegotchiDiamond.json`;
  } else if (mintableType === "wearables") {
    return `${DATA_PATH}/wearables/wearables-diamond.json`;
  }
  throw new Error(`Invalid mintable type: ${mintableType}`);
}

async function processMintingForType(mintableType: MintableType) {
  const itemsFile = getFilePath(mintableType);
  const logPrefix = `[MintToAavegotchiDiamond/${mintableType}]`;

  console.log(`${logPrefix} Starting minting process...`);
  console.log(`${logPrefix} Items file: ${itemsFile}`);

  if (!fs.existsSync(itemsFile)) {
    console.warn(`WARNING: Items file not found at ${itemsFile}. Skipping.`);
    return;
  }

  const c = await varsForNetwork(ethers);
  if (!c.aavegotchiDiamond) {
    throw new Error("aavegotchiDiamond address not found in constants");
  }
  // @ts-ignore
  const signer = await getRelayerSigner(hre);

  const contract = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond,
    signer
  )) as AavegotchiBridgeFacet;

  const fileContent = fs.readFileSync(itemsFile, "utf8");

  try {
    let tx;

    if (mintableType === "gotchis") {
      const tokenIdsToMint: string[] = JSON.parse(fileContent);
      if (tokenIdsToMint.length === 0) {
        console.log(`${logPrefix} No items to mint. Skipping.`);
        return;
      }
      console.log(
        `${logPrefix} Attempting to mint ${tokenIdsToMint.length} gotchis...`
      );
      tx = await contract.mintAavegotchiBridged([
        {
          owner: c.aavegotchiDiamond,
          tokenIds: tokenIdsToMint,
        },
      ]);
    } else {
      // wearables
      const allItems: ItemBalance[] = JSON.parse(fileContent);
      if (allItems.length === 0) {
        console.log(`${logPrefix} No items to mint. Skipping.`);
        return;
      }
      console.log(
        `${logPrefix} Attempting to mint ${allItems.length} wearable types...`
      );
      tx = await contract.batchMintItems([
        {
          to: c.aavegotchiDiamond, // Minting to Aavegotchi Diamond
          itemBalances: allItems.map((item) => ({
            itemId: ethers.BigNumber.from(item.tokenId),
            quantity: item.balance,
          })),
        },
      ]);
    }

    console.log(
      `${logPrefix} Transaction sent: ${tx.hash}. Waiting for confirmation...`
    );
    await tx.wait();
    console.log(`${logPrefix} Transaction confirmed.`);
  } catch (error: any) {
    console.error(`${logPrefix} Error during minting: `, error);
    throw error;
  }
}

async function main() {
  console.log("--- Starting Aavegotchi Diamond Minting Script ---");

  console.log("\n[STEP 1] Processing Gotchis...");
  const gotchiTask = "mintAavegotchisToAavegotchiDiamond";
  ensureMiscProgress(gotchiTask);
  await processMintingForType("gotchis");
  writeMiscProgress(gotchiTask, true);

  console.log("\n[STEP 2] Processing Wearables...");
  const wearableTask = "mintWearablesToAavegotchiDiamond";
  ensureMiscProgress(wearableTask);
  await processMintingForType("wearables");
  writeMiscProgress(wearableTask, true);

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
