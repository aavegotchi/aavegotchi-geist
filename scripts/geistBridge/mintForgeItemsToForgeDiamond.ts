import { ethers } from "hardhat";
import fs from "fs";
import { ForgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { DATA_PATH } from "./paths";
import { getRelayerSigner } from "../helperFunctions";

const FORGE_ITEMS_FILE = `${DATA_PATH}/forgeWearables/forgeWearables-forgeDiamond.json`;

async function mintForgeDiamondItems() {
  const c = await varsForNetwork(ethers);
  const forgeItems = JSON.parse(fs.readFileSync(FORGE_ITEMS_FILE, "utf8"));
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  console.log("Loaded Forge Items data:");
  console.log(
    `Total items to mint: ${forgeItems.reduce(
      (sum: number, item: any) => sum + item.balance,
      0
    )}`
  );

  const contract = (await ethers.getContractAt(
    "ForgeFacet",
    c.forgeDiamond!,
    signer
  )) as ForgeFacet;

  const tx = await contract.batchMintForgeItems([
    {
      to: c.forgeDiamond!,
      itemBalances: forgeItems.map((item: any) => ({
        itemId: ethers.BigNumber.from(item.tokenId),
        quantity: item.balance,
      })),
    },
  ]);

  console.log("Transaction sent:", tx.hash);
  // await tx.wait();
  console.log("Transaction confirmed!");
}

if (require.main === module) {
  mintForgeDiamondItems()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
