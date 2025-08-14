import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { AavegotchiBridgeFacet } from "../../typechain";
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { PC_WALLET } from "./paths";

const DATA_PATH = path.join(__dirname, "cloneData/wearables");
const CONTRACTS_WITHOUT_EOA_FILE = path.join(
  DATA_PATH,
  "wearables-contractsWithoutEOAs-missing.json"
);
const CONTRACTS_WITH_EOA_FILE = path.join(
  DATA_PATH,
  "wearables-contractsWithEOA.json"
);
const GBM_DIAMOND_FILE = path.join(DATA_PATH, "wearables-gbmDiamond.json");

// TODO: Replace with the actual destination address for GBM Diamond wearables
const DESTINATION_ADDRESS = "0x01F010a5e001fe9d6940758EA5e8c777885E351e"; //PC wallet

interface ItemBalance {
  tokenId: string;
  balance: number;
}

type OwnerData = { [ownerAddress: string]: ItemBalance[] };

async function main() {
  console.log("--- Starting Wearables minting script ---");

  // ---------------- Load data ----------------
  let ownerData: OwnerData = {};

  // Load without EOA
  if (fs.existsSync(CONTRACTS_WITHOUT_EOA_FILE)) {
    console.log(`Reading owner data from ${CONTRACTS_WITHOUT_EOA_FILE}`);
    const json: OwnerData = JSON.parse(
      fs.readFileSync(CONTRACTS_WITHOUT_EOA_FILE, "utf8")
    );
    ownerData = { ...ownerData, ...json };
  } else {
    console.warn(`File not found: ${CONTRACTS_WITHOUT_EOA_FILE}. Continuing.`);
  }

  // Load with EOA
  if (fs.existsSync(CONTRACTS_WITH_EOA_FILE)) {
    console.log(`Reading owner data from ${CONTRACTS_WITH_EOA_FILE}`);
    const json: OwnerData = JSON.parse(
      fs.readFileSync(CONTRACTS_WITH_EOA_FILE, "utf8")
    );
    ownerData = { ...ownerData, ...json };
  } else {
    console.warn(`File not found: ${CONTRACTS_WITH_EOA_FILE}. Continuing.`);
  }

  // let gbmWearables: ItemBalance[] = [];
  // if (fs.existsSync(GBM_DIAMOND_FILE)) {
  //   console.log(`Reading GBM wearables from ${GBM_DIAMOND_FILE}`);
  //   gbmWearables = JSON.parse(fs.readFileSync(GBM_DIAMOND_FILE, "utf8"));
  // } else {
  //   console.warn(`File not found: ${GBM_DIAMOND_FILE}. No GBM wearables.`);
  // }

  // Aggregate balances across all owners
  const aggregateMap: { [tokenId: string]: number } = {};
  for (const items of Object.values(ownerData)) {
    for (const it of items) {
      aggregateMap[it.tokenId] = (aggregateMap[it.tokenId] || 0) + it.balance;
    }
  }

  const aggregatedWearables: ItemBalance[] = Object.entries(aggregateMap).map(
    ([tokenId, balance]) => ({ tokenId, balance })
  );

  console.log(
    `Total unique wearable types to mint: ${aggregatedWearables.length}`
  );

  const c = await varsForNetwork(ethers);
  if (!c.aavegotchiDiamond) {
    throw new Error("aavegotchiDiamond address not set in constants");
  }
  // @ts-ignore
  const signer = await getRelayerSigner(hre);

  const contract = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    c.aavegotchiDiamond,
    signer
  )) as AavegotchiBridgeFacet;

  // ---------------- Mint aggregated wearables to PC_WALLET ----------------
  if (aggregatedWearables.length > 0) {
    console.log(
      `\nMinting ${aggregatedWearables.length} wearable types to PC_WALLET (${PC_WALLET})...`
    );
    try {
      const tx = await contract.batchMintItems([
        {
          to: PC_WALLET,
          itemBalances: aggregatedWearables.map((it) => ({
            itemId: ethers.BigNumber.from(it.tokenId),
            quantity: it.balance,
          })),
        },
      ]);
      console.log(`  - Wearables Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log("  - ✅ Wearables minted to PC_WALLET");
    } catch (error: any) {
      console.error(
        "  - ❌ Failed to mint wearables to PC_WALLET:",
        error.message || error
      );
    }
  } else {
    console.log("No wearables found to mint from owner data.");
  }

  // ---------------- Mint GBM wearables ----------------
  // if (gbmWearables.length > 0) {
  //   console.log(
  //     `\nMinting ${gbmWearables.length} GBM wearable types to ${DESTINATION_ADDRESS}...`
  //   );
  //   try {
  //     const tx = await contract.batchMintItems([
  //       {
  //         to: DESTINATION_ADDRESS,
  //         itemBalances: gbmWearables.map((it) => ({
  //           itemId: ethers.BigNumber.from(it.tokenId),
  //           quantity: it.balance,
  //         })),
  //       },
  //     ]);
  //     console.log(`  - GBM Tx sent: ${tx.hash}`);
  //     await tx.wait();
  //     console.log("  - ✅ GBM wearables minted successfully");
  //   } catch (error: any) {
  //     console.error(
  //       `  - ❌ Failed to mint GBM wearables:`,
  //       error.message || error
  //     );
  //   }
  // }

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
