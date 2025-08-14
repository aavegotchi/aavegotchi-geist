import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { deploySafe } from "./deploySafe";
import { ForgeFacet, AavegotchiBridgeFacet } from "../../typechain";
import { getRelayerSigner } from "../helperFunctions"; // Renamed for clarity
import { GNOSIS_PATH, PROCESSED_PATH, PC_WALLET } from "./paths";
import { DATA_PATH } from "./paths";
import { BigNumber } from "ethers"; // Added for contract calls
import { varsForNetwork } from "../../helpers/constants"; // Added

// === Configuration ===
const MAX_RETRIES = 3; // Added

// =====================

interface AavegotchiSafe {
  safeAddress: string;
  tokenIds: string[];
  startTime: number;
}

interface TokenData {
  tokenId: string;
  balance: number;
}

interface WearableTokenData {
  itemId: string;
  balance: number;
}

interface WearableSafe {
  safeAddress: string;
  tokens: WearableTokenData[];
}

interface ForgeSafe {
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
      minted: WearableTokenData[];
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
  startTime: number;
}

// Added interfaces for failed safe allocations
interface FailedSafeAllocationDetail {
  aavegotchis?: string[];
  wearables?: WearableTokenData[];
  forgeItems?: TokenData[];
}

interface FailedSafeAllocationsLog {
  [safeAddress: string]: FailedSafeAllocationDetail;
}

const PROGRESS_FILE = path.join(PROCESSED_PATH, "gnosis_minting_progress.json");
const FAILED_ALLOCATIONS_FILE = path.join(
  PROCESSED_PATH,
  "failed-safe-allocations.json"
);

// Create minting directory if it doesn't exist at the very start
if (!fs.existsSync(PROCESSED_PATH)) {
  fs.mkdirSync(PROCESSED_PATH, { recursive: true });
}

// Load data files
const loadSafeData = () => {
  const aavegotchiSafes: AavegotchiSafe[] = JSON.parse(
    fs.readFileSync(
      path.join(DATA_PATH, "aavegotchi", "aavegotchi-safe.json"),
      "utf8"
    )
  );

  // Load raw wearable data
  const rawWearableSafesData: any[] = JSON.parse(
    fs.readFileSync(
      path.join(DATA_PATH, "wearables", "wearables-safe.json"),
      "utf8"
    )
  );

  // Transform wearable data
  const wearableSafes: WearableSafe[] = rawWearableSafesData.map((safe) => ({
    ...safe,
    tokens: safe.tokens.map((token: any) => ({
      itemId: token.tokenId, // Map tokenId to itemId
      balance: token.balance,
      // Ensure all other properties from WearableTokenData are correctly mapped or included if necessary
    })),
  }));

  const forgeSafes: ForgeSafe[] = JSON.parse(
    fs.readFileSync(
      path.join(DATA_PATH, "forgeWearables", "forgeWearables-safe.json"),
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
  } catch (error: any) {
    const initialProgress: MintingProgress = {
      aavegotchis: {},
      wearables: {},
      forgeItems: {},
      failedMints: {
        aavegotchis: [],
        wearables: [],
        forgeItems: [],
      },
      startTime: Date.now(),
    };
    // Use saveProgress to initialize to ensure consistency and safety
    console.log(
      `Progress file ${PROGRESS_FILE} not found or unreadable. Creating a new one.`
    );
    saveProgress(initialProgress); // Initialize by saving
    return initialProgress;
  }
};

// Utility to save progress safely
function saveProgress(progress: MintingProgress): void {
  const tempProgressFile = PROGRESS_FILE + ".tmp";
  try {
    fs.writeFileSync(tempProgressFile, JSON.stringify(progress, null, 2));
    fs.renameSync(tempProgressFile, PROGRESS_FILE);
  } catch (error) {
    console.error("Critical error saving progress:", error);
    // Consider more robust backup or notification here if renaming fails
    if (fs.existsSync(tempProgressFile)) {
      try {
        fs.unlinkSync(tempProgressFile);
      } catch (cleanupError) {
        console.error("Error cleaning up temp progress file:", cleanupError);
      }
    }
  }
}

// Added function to save failed safe allocations
function saveFailedAllocations(allocations: FailedSafeAllocationsLog): void {
  try {
    fs.writeFileSync(
      FAILED_ALLOCATIONS_FILE,
      JSON.stringify(allocations, null, 2)
    );
    console.log(
      `Logged allocations for unverified safes to ${FAILED_ALLOCATIONS_FILE}`
    );
  } catch (error) {
    console.error("Critical error saving failed safe allocations:", error);
  }
}

// Get unique safe addresses and verify/deploy them
async function verifySafes(
  aavegotchiSafes: AavegotchiSafe[],
  wearableSafes: WearableSafe[],
  forgeSafes: ForgeSafe[]
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
  const progressEntry = progress.aavegotchis[safeAddress.toLowerCase()] || {
    minted: [],
    timestamp: 0,
  };

  const unmintedTokens = tokenIds.filter(
    (id) => !progressEntry.minted.includes(id)
  );

  if (unmintedTokens.length === 0) {
    console.log(`No new Aavegotchis to mint for safe ${safeAddress}.`);
    return true;
  }

  console.log(
    `Attempting to mint ${unmintedTokens.length} Aavegotchis to ${safeAddress}...`
  );

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      const tx = await contract.mintAavegotchiBridged([
        {
          owner: safeAddress,
          tokenIds: unmintedTokens,
        },
      ]);
      await ethers.provider.waitForTransaction(tx.hash, 1);
      console.log(
        `Successfully minted Aavegotchis to ${safeAddress}. Tx: ${tx.hash}`
      );

      if (!progress.aavegotchis[safeAddress.toLowerCase()]) {
        progress.aavegotchis[safeAddress.toLowerCase()] = {
          minted: [],
          timestamp: Date.now(),
        };
      }
      progress.aavegotchis[safeAddress.toLowerCase()].minted.push(
        ...unmintedTokens
      );
      progress.aavegotchis[safeAddress.toLowerCase()].timestamp = Date.now();

      // Clean up failed mints log on success
      const index = progress.failedMints.aavegotchis.indexOf(
        safeAddress.toLowerCase()
      );
      if (index > -1) {
        progress.failedMints.aavegotchis.splice(index, 1);
      }

      return true;
    } catch (error: any) {
      console.error(
        `Failed to mint Aavegotchis to ${safeAddress} on try ${
          retry + 1
        }/${MAX_RETRIES}:`,
        error.message || error
      );
      if (retry === MAX_RETRIES - 1) {
        if (
          !progress.failedMints.aavegotchis.includes(safeAddress.toLowerCase())
        ) {
          progress.failedMints.aavegotchis.push(safeAddress.toLowerCase());
        }
        return false;
      }
    }
  }
  return false;
}

async function mintWearablesToSafe(
  contract: AavegotchiBridgeFacet,
  safeAddress: string,
  tokens: WearableTokenData[],
  progress: MintingProgress
): Promise<boolean> {
  const safeAddrLower = safeAddress.toLowerCase();
  const progressEntry = progress.wearables[safeAddrLower] || {
    minted: [],
    timestamp: 0,
  };
  const mintedTokenIds = progressEntry.minted.map((t) => t.itemId); // Assuming TokenData has tokenId
  const unmintedTokens = tokens.filter(
    (token) => !mintedTokenIds.includes(token.itemId)
  );

  if (unmintedTokens.length === 0) {
    console.log(`No new Wearables to mint for safe ${safeAddress}.`);
    return true;
  }
  console.log(
    `Attempting to mint ${unmintedTokens.length} types of Wearables to ${safeAddress}...`
  );

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      const tx = await contract.batchMintItems([
        {
          to: safeAddress,
          itemBalances: unmintedTokens.map((token) => ({
            itemId: BigNumber.from(token.itemId), // Corrected to itemId and BigNumber
            quantity: BigNumber.from(token.balance), // Corrected to quantity and BigNumber
          })),
        },
      ]);
      await ethers.provider.waitForTransaction(tx.hash, 1);
      console.log(
        `Successfully minted Wearables to ${safeAddress}. Tx: ${tx.hash}`
      );

      if (!progress.wearables[safeAddrLower]) {
        progress.wearables[safeAddrLower] = {
          minted: [],
          timestamp: Date.now(),
        };
      }
      progress.wearables[safeAddrLower].minted.push(...unmintedTokens); // Store original TokenData
      progress.wearables[safeAddrLower].timestamp = Date.now();

      // Clean up failed mints log on success
      const index = progress.failedMints.wearables.indexOf(safeAddrLower);
      if (index > -1) {
        progress.failedMints.wearables.splice(index, 1);
      }

      return true;
    } catch (error: any) {
      console.error(
        `Failed to mint Wearables to ${safeAddress} on try ${
          retry + 1
        }/${MAX_RETRIES}:`,
        error.message || error
      );
      if (retry === MAX_RETRIES - 1) {
        if (!progress.failedMints.wearables.includes(safeAddrLower)) {
          progress.failedMints.wearables.push(safeAddrLower);
        }
        return false;
      }
    }
  }
  return false;
}

async function mintForgeItemsToSafe(
  contract: ForgeFacet,
  safeAddress: string,
  tokens: TokenData[],
  progress: MintingProgress
): Promise<boolean> {
  const safeAddrLower = safeAddress.toLowerCase();
  const progressEntry = progress.forgeItems[safeAddrLower] || {
    minted: [],
    timestamp: 0,
  };
  const mintedTokenIds = progressEntry.minted.map((t) => t.tokenId);
  const unmintedTokens = tokens.filter(
    (token) => !mintedTokenIds.includes(token.tokenId)
  );

  if (unmintedTokens.length === 0) {
    console.log(`No new Forge items to mint for safe ${safeAddress}.`);
    return true;
  }
  console.log(
    `Attempting to mint ${unmintedTokens.length} types of Forge items to ${safeAddress}...`
  );

  // Assuming ForgeFacet has a similar batchMintForgeItems method
  // IMPORTANT: Verify the actual method name and parameters for ForgeFacet
  const forgeItemBalances = unmintedTokens.map((token) => ({
    itemId: BigNumber.from(token.tokenId),
    quantity: BigNumber.from(token.balance),
  }));

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      // TODO: Replace with actual ForgeFacet method if available and different
      // This is a placeholder structure based on batchMintItems
      const tx = await contract.batchMintForgeItems([
        {
          to: safeAddress,
          itemBalances: forgeItemBalances,
        },
      ]);
      // Example if it was like batchMintItems:
      // const tx = await contract.batchMintForgeItems([{ to: safeAddress, itemBalances: forgeItemBalances }]);
      await ethers.provider.waitForTransaction(tx.hash, 1);
      console.log(
        `Successfully minted Forge items to ${safeAddress}. Tx: ${tx.hash}`
      );

      if (!progress.forgeItems[safeAddrLower]) {
        progress.forgeItems[safeAddrLower] = {
          minted: [],
          timestamp: Date.now(),
        };
      }
      progress.forgeItems[safeAddrLower].minted.push(...unmintedTokens);
      progress.forgeItems[safeAddrLower].timestamp = Date.now();

      // Clean up failed mints log on success
      const index = progress.failedMints.forgeItems.indexOf(safeAddrLower);
      if (index > -1) {
        progress.failedMints.forgeItems.splice(index, 1);
      }

      return true;
    } catch (error: any) {
      console.error(
        `Failed to mint Forge items to ${safeAddress} on try ${
          retry + 1
        }/${MAX_RETRIES}:`,
        error.message || error
      );
      if (retry === MAX_RETRIES - 1) {
        if (!progress.failedMints.forgeItems.includes(safeAddrLower)) {
          progress.failedMints.forgeItems.push(safeAddrLower);
        }
        return false;
      }
    }
  }
  return false;
}

// Update the main minting function
async function mintToSafes() {
  const contractAddresses = await varsForNetwork(ethers);
  // @ts-ignore
  const signer = await getRelayerSigner(hre);
  // Create minting directory moved to top level for immediate check

  // Load all data
  const { aavegotchiSafes, wearableSafes, forgeSafes } = loadSafeData();
  const progress = loadProgress();

  // --- Determine safes to process dynamically, ignoring lastProcessedIndex ---
  console.log(
    "--- Dynamically determining which safes require processing... ---"
  );
  const allSafesInSource = new Set<string>();
  aavegotchiSafes.forEach((s) =>
    allSafesInSource.add(s.safeAddress.toLowerCase())
  );
  wearableSafes.forEach((s) =>
    allSafesInSource.add(s.safeAddress.toLowerCase())
  );
  forgeSafes.forEach((s) => allSafesInSource.add(s.safeAddress.toLowerCase()));

  const safesToProcess = new Set<string>();

  for (const safeAddress of allSafesInSource) {
    const aData = aavegotchiSafes.find(
      (s) => s.safeAddress.toLowerCase() === safeAddress
    );
    const wData = wearableSafes.find(
      (s) => s.safeAddress.toLowerCase() === safeAddress
    );
    const fData = forgeSafes.find(
      (s) => s.safeAddress.toLowerCase() === safeAddress
    );

    let needsProcessing = false;

    // Check Aavegotchis
    if (aData?.tokenIds.length) {
      const mintedCount = progress.aavegotchis[safeAddress]?.minted.length || 0;
      if (mintedCount < aData.tokenIds.length) {
        needsProcessing = true;
      }
    }

    // Check Wearables
    if (wData?.tokens.length) {
      const mintedCount = progress.wearables[safeAddress]?.minted.length || 0;
      if (mintedCount < wData.tokens.length) {
        needsProcessing = true;
      }
    }

    // Check Forge Items
    if (fData?.tokens.length) {
      const mintedCount = progress.forgeItems[safeAddress]?.minted.length || 0;
      if (mintedCount < fData.tokens.length) {
        needsProcessing = true;
      }
    }

    if (needsProcessing) {
      safesToProcess.add(safeAddress);
    }
  }
  const allSafesForProcessing = [...safesToProcess];
  console.log(
    `Found ${allSafesForProcessing.length} safes that require processing.`
  );

  // Verify/deploy safes
  const verifiedSafes = await verifySafes(
    aavegotchiSafes,
    wearableSafes,
    forgeSafes
  );

  // =====================
  // Handle UNVERIFIED safes: mint their allocations to PC_WALLET
  // =====================

  // Collect assets that belong to safes which failed to deploy
  const pcAavegotchiTokenIds: string[] = [];
  const pcWearableTokens: WearableTokenData[] = [];
  const pcForgeTokens: TokenData[] = [];

  const verifiedSafesSet = new Set(verifiedSafes.map((s) => s.toLowerCase()));

  const allInitialSafeAddresses = new Set<string>();
  aavegotchiSafes.forEach((s) =>
    allInitialSafeAddresses.add(s.safeAddress.toLowerCase())
  );
  wearableSafes.forEach((s) =>
    allInitialSafeAddresses.add(s.safeAddress.toLowerCase())
  );
  forgeSafes.forEach((s) =>
    allInitialSafeAddresses.add(s.safeAddress.toLowerCase())
  );

  const unverifiedSafeAddresses = [...allInitialSafeAddresses].filter(
    (addr) => !verifiedSafesSet.has(addr)
  );

  // Prepare log structure for failed safe allocations
  const currentRunFailedAllocations: FailedSafeAllocationsLog = {};

  for (const safeAddress of unverifiedSafeAddresses) {
    const aData = aavegotchiSafes.find(
      (s) => s.safeAddress.toLowerCase() === safeAddress
    );
    const wData = wearableSafes.find(
      (s) => s.safeAddress.toLowerCase() === safeAddress
    );
    const fData = forgeSafes.find(
      (s) => s.safeAddress.toLowerCase() === safeAddress
    );

    if (aData?.tokenIds?.length) {
      pcAavegotchiTokenIds.push(...aData.tokenIds);
    }

    if (wData?.tokens?.length) {
      pcWearableTokens.push(...wData.tokens);
    }

    if (fData?.tokens?.length) {
      pcForgeTokens.push(...fData.tokens);
    }

    // Build allocation detail for logging
    const allocationDetail: FailedSafeAllocationDetail = {};
    if (aData?.tokenIds && aData.tokenIds.length > 0) {
      allocationDetail.aavegotchis = aData.tokenIds;
    }
    if (wData?.tokens && wData.tokens.length > 0) {
      allocationDetail.wearables = wData.tokens;
    }
    if (fData?.tokens && fData.tokens.length > 0) {
      allocationDetail.forgeItems = fData.tokens;
    }

    if (Object.keys(allocationDetail).length > 0) {
      currentRunFailedAllocations[safeAddress] = allocationDetail;
    }
  }

  // Persist failed allocation log (unchanged behavior)
  if (Object.keys(currentRunFailedAllocations).length > 0) {
    console.log(
      `Logging allocations for ${
        Object.keys(currentRunFailedAllocations).length
      } unverified safes to file.`
    );
    saveFailedAllocations(currentRunFailedAllocations);
  }

  // -------- Aggregate duplicates for ERC-1155 style tokens --------
  function aggregateWearableBalances(
    tokens: WearableTokenData[]
  ): WearableTokenData[] {
    const map: { [id: string]: number } = {};
    for (const t of tokens) {
      map[t.itemId] = (map[t.itemId] || 0) + t.balance;
    }
    return Object.entries(map).map(([itemId, balance]) => ({
      itemId,
      balance,
    }));
  }

  function aggregateForgeBalances(tokens: TokenData[]): TokenData[] {
    const map: { [id: string]: number } = {};
    for (const t of tokens) {
      map[t.tokenId] = (map[t.tokenId] || 0) + t.balance;
    }
    return Object.entries(map).map(([tokenId, balance]) => ({
      tokenId,
      balance,
    }));
  }

  const aggregatedWearableTokens = aggregateWearableBalances(pcWearableTokens);
  const aggregatedForgeTokens = aggregateForgeBalances(pcForgeTokens);

  // Initialize contracts (after we have signer)
  const aavegotchiFacet = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    contractAddresses.aavegotchiDiamond!,
    signer
  )) as AavegotchiBridgeFacet;

  const forgeFacet = (await ethers.getContractAt(
    "ForgeFacet",
    contractAddresses.forgeDiamond!,
    signer
  )) as ForgeFacet;

  // --- Mint collected assets to PC_WALLET ---
  if (pcAavegotchiTokenIds.length > 0) {
    console.log(
      `Minting ${pcAavegotchiTokenIds.length} bridged Aavegotchis to PC_WALLET (${PC_WALLET})...`
    );
    try {
      const tx = await aavegotchiFacet.mintAavegotchiBridged([
        {
          owner: PC_WALLET,
          tokenIds: pcAavegotchiTokenIds,
        },
      ]);
      console.log(`  - Aavegotchi Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log("  - ✅ Aavegotchis minted to PC_WALLET");
    } catch (error: any) {
      console.error(
        "  - ❌ Failed to mint Aavegotchis to PC_WALLET:",
        error.message || error
      );
    }
  }

  if (aggregatedWearableTokens.length > 0) {
    console.log(
      `Minting ${aggregatedWearableTokens.length} types of Wearables to PC_WALLET (${PC_WALLET})...`
    );
    try {
      const tx = await aavegotchiFacet.batchMintItems([
        {
          to: PC_WALLET,
          itemBalances: aggregatedWearableTokens.map((t) => ({
            itemId: BigNumber.from(t.itemId),
            quantity: BigNumber.from(t.balance),
          })),
        },
      ]);
      console.log(`  - Wearables Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log("  - ✅ Wearables minted to PC_WALLET");
    } catch (error: any) {
      console.error(
        "  - ❌ Failed to mint Wearables to PC_WALLET:",
        error.message || error
      );
    }
  }

  if (aggregatedForgeTokens.length > 0) {
    console.log(
      `Minting ${aggregatedForgeTokens.length} types of Forge items to PC_WALLET (${PC_WALLET})...`
    );
    try {
      const tx = await forgeFacet.batchMintForgeItems([
        {
          to: PC_WALLET,
          itemBalances: aggregatedForgeTokens.map((t) => ({
            itemId: BigNumber.from(t.tokenId),
            quantity: BigNumber.from(t.balance),
          })),
        },
      ]);
      console.log(`  - Forge items Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log("  - ✅ Forge items minted to PC_WALLET");
    } catch (error: any) {
      console.error(
        "  - ❌ Failed to mint Forge items to PC_WALLET:",
        error.message || error
      );
    }
  }

  // Remove unverified safes from processing list to avoid redundant failures
  const verifiedSafesForProcessing = [...safesToProcess].filter((addr) =>
    verifiedSafesSet.has(addr)
  );
  console.log(
    `After filtering, ${verifiedSafesForProcessing.length} verified safes remain for regular processing.`
  );

  // NOTE: The previous block that only logged allocations has been kept but moved above; functionality unchanged apart from additional PC_WALLET minting.

  // Process safes from the dynamically generated list
  for (let i = 0; i < verifiedSafesForProcessing.length; i++) {
    const safeAddress = verifiedSafesForProcessing[i];
    console.log(
      `\nProcessing safe ${i + 1}/${
        verifiedSafesForProcessing.length
      }: ${safeAddress}`
    );

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

    // Save progress after each safe is attempted
    saveProgress(progress);
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
