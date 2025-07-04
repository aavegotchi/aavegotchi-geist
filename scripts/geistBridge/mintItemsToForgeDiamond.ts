import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { ForgeFacet, AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { DATA_PATH, ensureMiscProgress, writeMiscProgress } from "./paths";
import { getRelayerSigner } from "../helperFunctions";

interface ItemBalance {
  tokenId: string;
  balance: number;
}

type MintableType = "forge-items" | "wearables";

function getFilePaths(mintableType: MintableType): {
  itemsFile: string;
} {
  if (mintableType === "forge-items") {
    return {
      itemsFile: `${DATA_PATH}/forgeWearables/forgeWearables-forgeDiamond.json`,
    };
  } else if (mintableType === "wearables") {
    return {
      itemsFile: `${DATA_PATH}/wearables/wearables-forgeDiamond.json`,
    };
  }
  throw new Error(`Invalid mintable type: ${mintableType}`);
}

async function processMintingForType(mintableType: MintableType) {
  const { itemsFile } = getFilePaths(mintableType);
  const logPrefix = `[${mintableType}]`;

  console.log(`${logPrefix} Starting minting script...`);
  console.log(`${logPrefix} Items file: ${itemsFile}`);

  if (!fs.existsSync(itemsFile)) {
    console.warn(`WARNING: Items file not found at ${itemsFile}. Skipping.`);
    return;
  }

  const c = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);

  const allItems: ItemBalance[] = JSON.parse(
    fs.readFileSync(itemsFile, "utf8")
  );

  if (allItems.length === 0) {
    console.log(`${logPrefix} No items to mint. Skipping.`);
    return;
  }

  console.log(`${logPrefix} Total items to mint: ${allItems.length}`);

  try {
    let tx;

    // === Forge-items minting ===
    if (mintableType === "forge-items") {
      const contract = (await ethers.getContractAt(
        "ForgeFacet",
        c.forgeDiamond!,
        signer
      )) as ForgeFacet;
      tx = await contract.batchMintForgeItems([
        {
          to: c.forgeDiamond!,
          itemBalances: allItems.map((item) => ({
            itemId: ethers.BigNumber.from(item.tokenId),
            quantity: item.balance,
          })),
        },
      ]);
    } else {
      // === Wearables minting ===
      const contract = (await ethers.getContractAt(
        "AavegotchiBridgeFacet",
        c.aavegotchiDiamond!,
        signer
      )) as AavegotchiBridgeFacet;

      tx = await contract.batchMintItems([
        {
          to: c.forgeDiamond!,
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
    console.log(`${logPrefix} Transaction confirmed. Minting successful.`);
  } catch (error: any) {
    console.error(
      `${logPrefix} Error minting items: `,
      error.message || JSON.stringify(error)
    );
    throw error;
  }
}

async function main() {
  console.log("--- Starting Forge and Wearable Minting Script ---");

  console.log("\n[STEP 1] Processing Forge Items...");
  ensureMiscProgress("mintForgeItemsToForgeDiamond");
  await processMintingForType("forge-items");
  writeMiscProgress("mintForgeItemsToForgeDiamond", true);

  console.log("\n[STEP 2] Processing Wearables...");
  ensureMiscProgress("mintWearablesToForgeDiamond");
  await processMintingForType("wearables");
  writeMiscProgress("mintWearablesToForgeDiamond", true);

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
