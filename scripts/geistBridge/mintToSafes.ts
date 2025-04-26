import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { deploySafe } from "./deploySafe";
import {
  ForgeFacet,
  DAOFacet,
  AavegotchiFacet,
  AavegotchiBridgeFacet,
} from "../../typechain";
import { maticDiamondAddress } from "../helperFunctions";
import { GNOSIS_PATH } from "./deploySafe";

interface AavegotchiSafe {
  safeAddress: string;
  tokenIds: string[];
}

interface TokenData {
  tokenId: string;
  balance: number;
}

interface WearableSafe {
  safeAddress: string;
  tokens: TokenData[];
}

interface MintingProgress {
  aavegotchis: {
    [safeAddress: string]: {
      minted: string[];
      timestamp: number;
    };
  };
  wearables: {
    [safeAddress: string]: {
      minted: TokenData[];
      timestamp: number;
    };
  };
  forgeItems: {
    [safeAddress: string]: {
      minted: TokenData[];
      timestamp: number;
    };
  };
  failedMints: {
    aavegotchis: string[];
    wearables: string[];
    forgeItems: string[];
  };
  lastProcessedIndex: number;
  startTime: number;
}

const MINTING_DIR = path.join(GNOSIS_PATH, "minting");
const PROGRESS_FILE = path.join(MINTING_DIR, "minting-progress.json");

// Load data files
const loadSafeData = () => {
  const aavegotchiSafes: AavegotchiSafe[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "aavegotchi", "aavegotchi-safe.json"),
      "utf8"
    )
  );

  const wearableSafes: WearableSafe[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "wearables", "wearables-safe.json"),
      "utf8"
    )
  );

  const forgeSafes: WearableSafe[] = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "forgeWearables", "forgeWearables-safe.json"),
      "utf8"
    )
  );

  return {
    aavegotchiSafes,
    wearableSafes,
    forgeSafes,
  };
};

// Load or initialize progress
const loadProgress = (): MintingProgress => {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch (error) {
    const initialProgress: MintingProgress = {
      aavegotchis: {},
      wearables: {},
      forgeItems: {},
      failedMints: {
        aavegotchis: [],
        wearables: [],
        forgeItems: [],
      },
      lastProcessedIndex: 0,
      startTime: Date.now(),
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(initialProgress, null, 2));
    return initialProgress;
  }
};

// Get unique safe addresses and verify/deploy them
async function verifySafes(
  aavegotchiSafes: AavegotchiSafe[],
  wearableSafes: WearableSafe[],
  forgeSafes: WearableSafe[]
): Promise<string[]> {
  // Get unique safe addresses
  const uniqueSafes = new Set([
    ...aavegotchiSafes.map((safe) => safe.safeAddress.toLowerCase()),
    ...wearableSafes.map((safe) => safe.safeAddress.toLowerCase()),
    ...forgeSafes.map((safe) => safe.safeAddress.toLowerCase()),
  ]);

  const verifiedSafes: string[] = [];

  console.log(`Verifying ${uniqueSafes.size} unique safes...`);

  for (const safeAddress of uniqueSafes) {
    const result = await deploySafe(safeAddress);
    if (result) {
      verifiedSafes.push(safeAddress);
    }
  }

  console.log(`Successfully verified ${verifiedSafes.length} safes`);
  return verifiedSafes;
}

// Add these helper functions first
async function mintAavegotchisToSafe(
  contract: AavegotchiBridgeFacet,
  safeAddress: string,
  tokenIds: string[],
  progress: MintingProgress
): Promise<boolean> {
  try {
    const unmintedTokens = tokenIds.filter(
      (id) => !progress.aavegotchis[safeAddress]?.minted.includes(id)
    );

    if (unmintedTokens.length === 0) {
      return true;
    }

    // const tx = await contract.mintAavegotchiBridged([
    //   {
    //     owner: safeAddress,
    //     tokenIds: unmintedTokens,
    //   },
    // ]);
    // await tx.wait();

    // Update progress
    if (!progress.aavegotchis[safeAddress]) {
      progress.aavegotchis[safeAddress] = {
        minted: [],
        timestamp: Date.now(),
      };
    }
    progress.aavegotchis[safeAddress].minted.push(...unmintedTokens);
    return true;
  } catch (error) {
    console.error(`Failed to mint Aavegotchis to ${safeAddress}:`, error);
    if (!progress.failedMints.aavegotchis.includes(safeAddress)) {
      progress.failedMints.aavegotchis.push(safeAddress);
    }
    return false;
  }
}

async function mintWearablesToSafe(
  contract: AavegotchiBridgeFacet,
  safeAddress: string,
  tokens: TokenData[],
  progress: MintingProgress
): Promise<boolean> {
  try {
    const mintedTokenIds =
      progress.wearables[safeAddress]?.minted.map((t) => t.tokenId) || [];
    const unmintedTokens = tokens.filter(
      (token) => !mintedTokenIds.includes(token.tokenId)
    );

    if (unmintedTokens.length === 0) {
      return true;
    }

    // const tx = await contract.batchMintItems([
    //   {
    //     to: safeAddress,
    //     itemBalances: unmintedTokens.map((token) => ({
    //       itemId: token.tokenId,
    //       quantity: token.balance,
    //     })),
    //   },
    // ]);
    // await tx.wait();

    // Update progress
    if (!progress.wearables[safeAddress]) {
      progress.wearables[safeAddress] = {
        minted: [],
        timestamp: Date.now(),
      };
    }
    progress.wearables[safeAddress].minted.push(...unmintedTokens);
    return true;
  } catch (error) {
    console.error(`Failed to mint Wearables to ${safeAddress}:`, error);
    if (!progress.failedMints.wearables.includes(safeAddress)) {
      progress.failedMints.wearables.push(safeAddress);
    }
    return false;
  }
}

async function mintForgeItemsToSafe(
  contract: ForgeFacet,
  safeAddress: string,
  tokens: TokenData[],
  progress: MintingProgress
): Promise<boolean> {
  try {
    const mintedTokenIds =
      progress.forgeItems[safeAddress]?.minted.map((t) => t.tokenId) || [];
    const unmintedTokens = tokens.filter(
      (token) => !mintedTokenIds.includes(token.tokenId)
    );

    if (unmintedTokens.length === 0) {
      return true;
    }

    // const tx = await contract.batchMintForgeItems([
    //   {
    //     to: safeAddress,
    //     itemBalances: unmintedTokens.map((token) => ({
    //       itemId: token.tokenId,
    //       quantity: token.balance,
    //     })),
    //   },
    // ]);
    // await tx.wait();

    // Update progress
    if (!progress.forgeItems[safeAddress]) {
      progress.forgeItems[safeAddress] = {
        minted: [],
        timestamp: Date.now(),
      };
    }
    progress.forgeItems[safeAddress].minted.push(...unmintedTokens);
    return true;
  } catch (error) {
    console.error(`Failed to mint Forge items to ${safeAddress}:`, error);
    if (!progress.failedMints.forgeItems.includes(safeAddress)) {
      progress.failedMints.forgeItems.push(safeAddress);
    }
    return false;
  }
}

// Update the main minting function
async function mintToSafes() {
  // Create minting directory if it doesn't exist
  if (!fs.existsSync(MINTING_DIR)) {
    fs.mkdirSync(MINTING_DIR, { recursive: true });
  }

  // Load all data
  const { aavegotchiSafes, wearableSafes, forgeSafes } = loadSafeData();
  const progress = loadProgress();

  // Verify/deploy safes
  const verifiedSafes = await verifySafes(
    aavegotchiSafes,
    wearableSafes,
    forgeSafes
  );

  // Initialize contracts
  const aavegotchiFacet = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    maticDiamondAddress
  )) as AavegotchiBridgeFacet;

  // const daoFacet = (await ethers.getContractAt(
  //   "DAOFacet",
  //   maticDiamondAddress
  // )) as DAOFacet;

  const forgeFacet = (await ethers.getContractAt(
    "ForgeFacet",
    maticDiamondAddress
  )) as ForgeFacet;

  // Process each verified safe
  for (const safeAddress of verifiedSafes) {
    console.log(`\nProcessing safe: ${safeAddress}`);

    // 1. Mint Aavegotchis
    const aavegotchiData = aavegotchiSafes.find(
      (safe) => safe.safeAddress.toLowerCase() === safeAddress.toLowerCase()
    );
    if (aavegotchiData) {
      console.log(`Minting ${aavegotchiData.tokenIds.length} Aavegotchis...`);
      await mintAavegotchisToSafe(
        aavegotchiFacet,
        safeAddress,
        aavegotchiData.tokenIds,
        progress
      );
    }

    // 2. Mint Wearables
    const wearableData = wearableSafes.find(
      (safe) => safe.safeAddress.toLowerCase() === safeAddress.toLowerCase()
    );
    if (wearableData) {
      console.log(`Minting ${wearableData.tokens.length} Wearables...`);
      await mintWearablesToSafe(
        aavegotchiFacet,
        safeAddress,
        wearableData.tokens,
        progress
      );
    }

    // 3. Mint Forge Items
    const forgeData = forgeSafes.find(
      (safe) => safe.safeAddress.toLowerCase() === safeAddress.toLowerCase()
    );
    if (forgeData) {
      console.log(`Minting ${forgeData.tokens.length} Forge items...`);
      await mintForgeItemsToSafe(
        forgeFacet,
        safeAddress,
        forgeData.tokens,
        progress
      );
    }

    // Save progress after each safe
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    printAnalytics(progress);
  }

  console.log("\nMinting process completed!");
  printAnalytics(progress);
}

// Add analytics printing function
function printAnalytics(progress: MintingProgress) {
  const timeElapsed = Date.now() - progress.startTime;

  console.log("\n=== Minting Progress Analytics ===");
  console.log("Aavegotchis:");
  console.log(`- Minted: ${Object.keys(progress.aavegotchis).length}`);
  console.log(`- Failed: ${progress.failedMints.aavegotchis.length}`);

  console.log("\nWearables:");
  console.log(`- Minted to safes: ${Object.keys(progress.wearables).length}`);
  console.log(`- Failed: ${progress.failedMints.wearables.length}`);

  console.log("\nForge Items:");
  console.log(`- Minted to safes: ${Object.keys(progress.forgeItems).length}`);
  console.log(`- Failed: ${progress.failedMints.forgeItems.length}`);

  console.log(
    `\nTime Elapsed: ${(timeElapsed / 1000 / 60).toFixed(2)} minutes`
  );
  console.log("================================\n");
}

if (require.main === module) {
  mintToSafes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
