import { ethers, network } from "hardhat";
import {
  gasPrice,
  getLedgerSigner,
  impersonate,
  itemManagerAlt,
  maticForgeDiamond,
} from "../helperFunctions";
import {
  ForgeDAOFacet,
  ForgeFacet,
  ForgeTokenFacet,
  ItemsFacet,
} from "../../typechain";
import { LedgerSigner } from "@anders-t/ethers-ledger";
import { varsForNetwork } from "../../helpers/constants";
import { PC_WALLET } from "../geistBridge/paths";

export async function batchMintBaseWearables() {
  const c = await varsForNetwork(ethers);

  const testing = ["hardhat", "localhost"].includes(network.name);
  let forgeFacet = (await ethers.getContractAt(
    "contracts/Aavegotchi/ForgeDiamond/facets/ForgeFacet.sol:ForgeFacet",
    c.forgeDiamond!
  )) as ForgeFacet;

  let forgeDaoFacet = (await ethers.getContractAt(
    "contracts/Aavegotchi/ForgeDiamond/facets/ForgeDaoFacet.sol:ForgeDaoFacet",
    c.forgeDiamond!
  )) as ForgeDAOFacet;

  if (testing) {
    const ownershipFacet = await ethers.getContractAt(
      "OwnershipFacet",
      c.forgeDiamond!
    );
    const owner = await ownershipFacet.owner();

    console.log("current owner:", owner);

    forgeFacet = await impersonate(owner, forgeFacet, ethers, network);
    forgeDaoFacet = await impersonate(owner, forgeDaoFacet, ethers, network);
  } else if (network.name === "base") {
    //item manager - ledger
    const signer = await getLedgerSigner(ethers);
    forgeFacet = forgeFacet.connect(signer);
    forgeDaoFacet = forgeDaoFacet.connect(signer);
  } else throw Error("Incorrect network selected");

  // schematics
  const common = [418];
  const rare = [419];
  const legendary = [420];
  const ids = [common, rare, legendary];
  const totalAmounts = [1000, 250, 100];

  //10% to pixelcraft, 90% to forge diamond
  const percents = [0.1, 0.9];
  const receipients = [PC_WALLET, c.forgeDiamond!];
  let toForge: number[] = [];

  for (let j = 0; j < receipients.length; j++) {
    const transferAmount = [];
    const transferIds = [];

    const recipient = receipients[j];
    const percent = percents[j];

    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids[i].length; j++) {
        transferIds.push(ids[i][j]);
        transferAmount.push(totalAmounts[i] * percent);
      }
    }

    console.log(
      `Batch minting to ${recipient}: ${transferIds} ${transferAmount}`
    );

    const tx = await forgeFacet.adminMintBatch(
      recipient,
      transferIds,
      transferAmount,
      { gasPrice: gasPrice }
    );
    console.log("tx hash:", tx.hash);
    const receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Error with transaction: ${tx.hash}`);
    }

    if (j === 1) {
      toForge = transferIds;
    }
  }

  const itemsFacet = (await ethers.getContractAt(
    "contracts/Aavegotchi/facets/ItemsFacet.sol:ItemsFacet",
    c.aavegotchiDiamond!
  )) as ItemsFacet;

  const ids2 = [418, 419, 420];
  const items = await itemsFacet.getItemTypes(ids2);
  let modifiers: number[] = [];
  for (let i = 0; i < items.length; i++) {
    modifiers.push(Number(items[i].rarityScoreModifier));
  }

  console.log("Creating Geode Prizes for Schematics:", ids2);
  console.log("rarites", modifiers);

  const tx = await forgeDaoFacet.setMultiTierGeodePrizes(
    ids2,
    toForge,
    modifiers
  );
  console.log("tx hash:", tx.hash);
  await tx.wait();

  console.log("set multi tier geode prizes");
}

if (require.main === module) {
  batchMintBaseWearables()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
