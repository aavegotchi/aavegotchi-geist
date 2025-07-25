// This script processes both subgraph_dump.json and aavegotchi_historical_data.json,
// calling the corresponding functions in AavegotchiBridgeFacet.

import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { TransactionResponse } from "@ethersproject/providers";
import fs from "fs";
import path from "path";
import axios from "axios"; // Added for GraphQL requests
import { AavegotchiBridgeFacet } from "../../typechain"; // Ensure typechain is generated correctly
import { varsForNetwork } from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { getAavegotchiBlockNumber, PROCESSED_PATH } from "./paths";

const SUBGRAPH_PROGRESS_FILE = path.join(
  PROCESSED_PATH,
  "subgraph-processing-progress.json"
);
const HISTORICAL_PROGRESS_FILE = path.join(
  PROCESSED_PATH,
  "historical-records-progress.json"
);
const CLAIMED_AT_EVENTS_PROGRESS_FILE = path.join(
  PROCESSED_PATH,
  "claimed-at-events-progress.json"
);

const MAX_RETRIES = 3;
const BATCH_SIZE_SUBGRAPH = 30; // Reduced due to potential object size
const BATCH_SIZE_HISTORICAL = 300; // Reduced due to oversized data error
const BATCH_SIZE_CLAIMED_AT = 1000; // Batch size for emitting ClaimedAt events
const RETRY_DELAY_MS = 2000;

// === GraphQL Configuration ===
const AAVEGOTCHI_SUBGRAPH_URL = process.env.SUBGRAPH_CORE_MATIC;
const AAVEGOTCHI_BLOCK_NUMBER = getAavegotchiBlockNumber();

const GRAPHQL_PAGE_SIZE = 10000; // Max items per GraphQL query page
const MAX_TOTAL_FETCH_LIMIT = 26000; // Safety limit for total items to fetch (e.g., 25000 Aavegotchis + buffer)

const GET_PORTALS_QUERY = `
  query GetPortalsPaginated(
    $first: Int!
    $skip: Int!
    $orderBy: Portal_orderBy
    $orderDirection: OrderDirection
  ) {
    portals(first: $first, block: {number:${AAVEGOTCHI_BLOCK_NUMBER}}, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      gotchiId
      buyer { id }
      hauntId
      owner { id }
      options(first: 10) { # Assuming max 10 options per portal
        id
        portalOptionId
        randomNumber
        numericTraits
        collateralType
        minimumStake
        baseRarityScore
      }
      status
      boughtAt
      openedAt
      claimedAt
      claimedTime
      timesTraded
      historicalPrices
      activeListing
    }
  }
`;

const GET_AAVEGOTCHIS_QUERY = `
  query GetAavegotchisPaginated(
    $first: Int!
    $skip: Int!
    $orderBy: Aavegotchi_orderBy
    $orderDirection: OrderDirection
  ) {
    aavegotchis(first: $first, block: {number:${AAVEGOTCHI_BLOCK_NUMBER}}, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      name
      createdAt
      historicalPrices
      timesTraded
      activeListing
    }
  }
`;
// =====================

//this script must only be run after metadata has been set
if (!fs.existsSync(path.join(PROCESSED_PATH, "metadata-progress.json"))) {
  console.error("Metadata has not been set. Please set metadata first.");
  process.exit(1);
}

// Ensure dataImport directory exists
if (!fs.existsSync(PROCESSED_PATH)) {
  fs.mkdirSync(PROCESSED_PATH, { recursive: true });
  console.log(`Created directory: ${PROCESSED_PATH}`);
}

// === Interfaces: Raw JSON Data (from Subgraph/GraphQL) ===

interface SubgraphEntityId {
  id: string;
}

interface SubgraphAavegotchiOrPortalData_Json {
  // Used for Portals from Subgraph
  id: string; // Used as a unique identifier for progress tracking
  gotchiId: string;
  buyer: SubgraphEntityId | null;
  hauntId: string;
  owner: SubgraphEntityId;
  options: SubgraphPortalOption_Json[];
  status: string;
  boughtAt: string | null;
  openedAt: string | null;
  claimedAt: string | null;
  claimedTime: string | null;
  timesTraded: string;
  historicalPrices: string[];
  activeListing: string | null;
}

interface SubgraphPortalOption_Json {
  id: string;
  portalOptionId: number;
  randomNumber: string;
  numericTraits: number[];
  collateralType: string;
  minimumStake: string;
  baseRarityScore: number;
}

interface JsonAavegotchiHistoricalEntry {
  // Used for Aavegotchis from Subgraph
  id: string; // Used as a unique identifier for progress tracking
  name: string;
  createdAt: string;
  historicalPrices: string[];
  timesTraded: string;
  activeListing: string | null;
  completedAt: number | null;
}

// === Interfaces: Contract Data Structures ===
// These must exactly match the structs in AavegotchiBridgeFacet.sol

interface ContractPortalOption {
  portalOptionId: BigNumber; // Solidity: uint8
  randomNumber: BigNumber;
  numericTraits: [
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber
  ]; // Solidity: uint8[6]
  collateralType: string; // address
  minimumStake: BigNumber;
  baseRarityScore: BigNumber; // Solidity: uint16
}

interface ContractAavegotchiSubgraphPortalData {
  // Name matches the struct in the contract
  gotchiId: BigNumber;
  buyer: string; // address
  hauntId: BigNumber;
  owner: string; // address
  options: ContractPortalOption[];
  status: string;
  boughtAtBlock: BigNumber;
  openedAtBlock: BigNumber;
  claimedAtBlock: BigNumber;
  claimedTimestamp: BigNumber;
  timesTraded: BigNumber;
  historicalPrices: BigNumber[];
  activeListingId: BigNumber;
}

interface ContractAavegotchiHistoricalRecord {
  // Name matches the struct in the contract
  gotchiId: BigNumber;
  name: string;
  createdAtBlock: BigNumber;
  historicalPrices: BigNumber[];
  timesTraded: BigNumber;
  activeListing: BigNumber;
}

interface ContractClaimedAtEventData {
  tokenId: BigNumber;
  claimedAtBlock: BigNumber;
}

// === Interfaces: Progress Tracking ===
interface BatchProcessingDetail {
  batchIndex: number;
  attemptTimestamp: number;
  success: boolean;
  error?: string;
  entryIdsInBatch: string[];
}

interface ProcessingProgress {
  totalEntriesInSource: number;
  processedEntryIds: string[];
  lastAttemptedBatchIndex: number;
  lastSuccessfullyProcessedBatchIndex: number;
  failedBatchDetails: BatchProcessingDetail[];
  currentRunFailedBatchIndexes: number[];
  startTime: number;
  completed: boolean;
  completedAt: number | null;
}

// === GraphQL Fetching Helper ===
async function fetchPaginatedGraphQLData<T extends { id: string }>(
  query: string,
  entityName: string, // e.g., "portals", "aavegotchis"
  orderBy: string = "id",
  orderDirection: "asc" | "desc" = "asc"
): Promise<T[]> {
  if (!AAVEGOTCHI_SUBGRAPH_URL) {
    throw new Error(
      "GraphQL endpoint URL is not configured. Please set AAVEGOTCHI_SUBGRAPH_URL."
    );
  }

  let allData: T[] = [];
  let skip = 0;
  let hasMore = true;
  console.log(`[GraphQL] Starting to fetch all '${entityName}'...`);

  while (hasMore && allData.length < MAX_TOTAL_FETCH_LIMIT) {
    try {
      const response = await axios.post(
        AAVEGOTCHI_SUBGRAPH_URL,
        {
          query,
          variables: {
            first: GRAPHQL_PAGE_SIZE,
            skip,
            orderBy,
            orderDirection,
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000, // 30 seconds timeout
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL query errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      const fetchedItems = response.data.data?.[entityName] as T[];

      if (fetchedItems && fetchedItems.length > 0) {
        allData = allData.concat(fetchedItems);
        skip += fetchedItems.length;
        console.log(
          `[GraphQL] Fetched ${fetchedItems.length} ${entityName}. Total: ${allData.length}`
        );
        if (fetchedItems.length < GRAPHQL_PAGE_SIZE) {
          hasMore = false; // Last page
        }
      } else {
        hasMore = false; // No more data or empty response
      }
    } catch (error: any) {
      console.error(
        `[GraphQL] Error fetching page for ${entityName} (skip: ${skip}):`,
        error.message || error
      );
      if (error.response?.data) {
        console.error(
          "GraphQL Error Details:",
          JSON.stringify(error.response.data)
        );
      }
      // Optional: Implement retries for fetching here if needed
      throw new Error(`Failed to fetch ${entityName} data after attempts.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500)); // Be nice to the API
  }

  if (allData.length >= MAX_TOTAL_FETCH_LIMIT) {
    console.warn(
      `[GraphQL] Reached MAX_TOTAL_FETCH_LIMIT of ${MAX_TOTAL_FETCH_LIMIT} for ${entityName}. Data might be incomplete.`
    );
  }

  console.log(
    `[GraphQL] Successfully fetched ${allData.length} total ${entityName}.`
  );
  return allData;
}

// === Helper Functions ===

function safeStringToBigNumber(
  value: string | null | undefined,
  defaultValue: BigNumber = BigNumber.from(0)
): BigNumber {
  if (value === null || value === undefined || value.trim() === "") {
    return defaultValue;
  }
  try {
    let bn = BigNumber.from(value);
    if (bn.isNegative()) {
      console.warn(
        `Warning: Parsed negative BigNumber ('${value}' -> ${bn.toString()}). Clamping to 0.`
      );
      bn = BigNumber.from(0);
    }
    return bn;
  } catch (e) {
    console.warn(
      `Warning: Could not convert '${value}' to BigNumber. Using default: ${defaultValue.toString()}`
    );
    return defaultValue;
  }
}

function ensureNumericTraitsFixedLength(
  traits: number[]
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] {
  const fixedLengthTraits: BigNumber[] = new Array(6).fill(BigNumber.from(0));
  for (let i = 0; i < 6; i++) {
    if (i < traits.length && traits[i] !== null && traits[i] !== undefined) {
      // numericTraits is now int16[6], so negative numbers are allowed.
      // We must ensure the number fits within int16 range: -32768 to 32767
      let traitVal = traits[i];
      if (traitVal < -32768) {
        console.warn(
          `Warning: Numeric trait at index ${i} (${traitVal}) is below int16 min. Clamping to -32768.`
        );
        traitVal = -32768;
      } else if (traitVal > 32767) {
        console.warn(
          `Warning: Numeric trait at index ${i} (${traitVal}) is above int16 max. Clamping to 32767.`
        );
        traitVal = 32767;
      }
      fixedLengthTraits[i] = BigNumber.from(traitVal);
    } else {
      fixedLengthTraits[i] = BigNumber.from(0);
    }
  }
  return fixedLengthTraits as [
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber
  ];
}

function loadProgress<T extends ProcessingProgress>(
  filePath: string,
  defaultProgressGenerator: () => T
): T {
  try {
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const progress = JSON.parse(fileContent) as T;
      if (
        !progress.processedEntryIds ||
        !Array.isArray(progress.processedEntryIds)
      ) {
        console.warn(
          `Progress file ${filePath} is missing processedEntryIds or it's not an array. Resetting relevant fields.`
        );
        progress.processedEntryIds = [];
      }
      // Reset ephemeral, run-specific state. Only processedEntryIds should persist for resumption.
      progress.lastSuccessfullyProcessedBatchIndex = -1;
      progress.lastAttemptedBatchIndex = -1;
      progress.failedBatchDetails = [];
      progress.currentRunFailedBatchIndexes = [];
      return progress;
    }
  } catch (error: any) {
    console.error(
      `Error loading progress from ${filePath}: `,
      error.message || error,
      `. Starting with new progress.`
    );
  }
  const newProgress = defaultProgressGenerator();
  saveProgress(filePath, newProgress); // Save new progress to ensure file existence
  return newProgress;
}

function saveProgress<T>(filePath: string, progress: T): void {
  const tempFilePath = filePath + ".tmp";
  try {
    const progressToSave: any = { ...progress };
    if (progressToSave.processedEntryIds instanceof Set) {
      // Although we use an array, this check is fine
      progressToSave.processedEntryIds = Array.from(
        progressToSave.processedEntryIds as Set<string>
      );
    }
    fs.writeFileSync(tempFilePath, JSON.stringify(progressToSave, null, 2));
    fs.renameSync(tempFilePath, filePath);
  } catch (error: any) {
    console.error(
      `CRITICAL: Failed to save progress to ${filePath}: `,
      error.message || error
    );
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError: any) {
        console.error(
          `CRITICAL: Failed to delete temporary progress file ${tempFilePath}: `,
          cleanupError.message || cleanupError
        );
      }
    }
  }
}

// === Transformation Functions ===

function transformSubgraphEntryToContractFormat(
  entry: SubgraphAavegotchiOrPortalData_Json
): ContractAavegotchiSubgraphPortalData {
  const contractOptions: ContractPortalOption[] = entry.options.map((opt) => {
    const portalOptionId = Math.max(0, opt.portalOptionId);
    if (opt.portalOptionId < 0) {
      console.warn(
        `Warning: Subgraph option portalOptionId was negative (${opt.portalOptionId}). Clamped to ${portalOptionId}.`
      );
    }
    const baseRarityScore = Math.max(0, opt.baseRarityScore);
    if (opt.baseRarityScore < 0) {
      console.warn(
        `Warning: Subgraph option baseRarityScore was negative (${opt.baseRarityScore}). Clamped to ${baseRarityScore}.`
      );
    }

    return {
      portalOptionId: BigNumber.from(portalOptionId),
      randomNumber: safeStringToBigNumber(opt.randomNumber),
      numericTraits: ensureNumericTraitsFixedLength(opt.numericTraits),
      collateralType: opt.collateralType,
      minimumStake: safeStringToBigNumber(opt.minimumStake),
      baseRarityScore: BigNumber.from(baseRarityScore),
    };
  });

  return {
    gotchiId: safeStringToBigNumber(entry.gotchiId),
    buyer: entry.buyer?.id || ethers.constants.AddressZero,
    hauntId: safeStringToBigNumber(entry.hauntId),
    owner: entry.owner.id,
    options: contractOptions,
    status: entry.status,
    boughtAtBlock: safeStringToBigNumber(entry.boughtAt),
    openedAtBlock: safeStringToBigNumber(entry.openedAt),
    claimedAtBlock: safeStringToBigNumber(entry.claimedAt),
    claimedTimestamp: safeStringToBigNumber(entry.claimedTime),
    timesTraded: safeStringToBigNumber(entry.timesTraded),
    historicalPrices: entry.historicalPrices.map((p) =>
      safeStringToBigNumber(p)
    ),
    activeListingId: safeStringToBigNumber(
      entry.activeListing,
      BigNumber.from(0)
    ),
  };
}

function transformHistoricalEntryToContractFormat(
  entry: JsonAavegotchiHistoricalEntry
): ContractAavegotchiHistoricalRecord {
  return {
    gotchiId: safeStringToBigNumber(entry.id),
    name: entry.name,
    createdAtBlock: safeStringToBigNumber(entry.createdAt),
    historicalPrices: entry.historicalPrices.map((p) =>
      safeStringToBigNumber(p)
    ),
    timesTraded: safeStringToBigNumber(entry.timesTraded),
    activeListing: safeStringToBigNumber(
      entry.activeListing,
      BigNumber.from(0)
    ),
  };
}

function transformPortalToClaimedAtEvent(
  entry: SubgraphAavegotchiOrPortalData_Json
): ContractClaimedAtEventData {
  return {
    tokenId: safeStringToBigNumber(entry.id),
    claimedAtBlock: safeStringToBigNumber(entry.claimedAt, BigNumber.from(0)),
  };
}

// === Generic Processing Logic ===

type ContractCallFunction<ContractType> = (
  batch: ContractType[]
) => Promise<TransactionResponse>;

async function processFile<
  JsonEntryType extends { id: string },
  ContractEntryType,
  ProgressType extends ProcessingProgress
>(
  fetchedData: JsonEntryType[], // Changed from filePath to directly accept data
  progressFilePath: string,
  defaultProgressGenerator: () => ProgressType,
  transformFunction: (entry: JsonEntryType) => ContractEntryType,
  contractCall: ContractCallFunction<ContractEntryType>,
  batchSize: number,
  logPrefix: string,
  contractInstance: AavegotchiBridgeFacet // Added to check function existence
): Promise<boolean> {
  console.log(`
[${logPrefix}] Starting processing for fetched data...`);
  let progress = loadProgress(progressFilePath, defaultProgressGenerator);

  if (progress.completed) {
    console.log(
      `[${logPrefix}] Processing for this data source already marked as completed on ${new Date(
        progress.completedAt!
      ).toISOString()}. Skipping.`
    );
    return true;
  }

  // Data is now passed directly, no need to read from file
  const jsonData = fetchedData;
  if (!Array.isArray(jsonData)) {
    // Should not happen if fetchPaginatedGraphQLData works correctly
    console.error(
      `[${logPrefix}] CRITICAL: Fetched data is not an array. This indicates an issue with the fetching logic.`
    );
    return false;
  }

  progress.totalEntriesInSource = jsonData.length;
  if (progress.startTime === 0) progress.startTime = Date.now();

  const entriesToProcess = jsonData.filter(
    (entry) => !progress.processedEntryIds.includes(entry.id)
  );

  if (entriesToProcess.length === 0 && jsonData.length > 0) {
    console.log(
      `[${logPrefix}] No new entries to process from fetched data. All ${jsonData.length} entries already processed.`
    );
    progress.completed = true;
    progress.completedAt = Date.now();
    saveProgress(progressFilePath, progress);
    return true;
  }
  if (jsonData.length === 0) {
    console.log(`[${logPrefix}] Fetched data is empty. Nothing to process.`);
    progress.completed = true;
    progress.completedAt = Date.now();
    saveProgress(progressFilePath, progress);
    return true;
  }

  console.log(
    `[${logPrefix}] Found ${entriesToProcess.length} new entries to process out of ${jsonData.length} total fetched entries.`
  );

  const batches: ContractEntryType[][] = [];
  const entryIdsInBatches: string[][] = [];
  for (let i = 0; i < entriesToProcess.length; i += batchSize) {
    const jsonDataBatch = entriesToProcess.slice(i, i + batchSize);
    batches.push(jsonDataBatch.map(transformFunction));
    entryIdsInBatches.push(jsonDataBatch.map((e) => e.id));
  }

  let overallSuccess = true;
  progress.currentRunFailedBatchIndexes = []; // Reset for this run

  for (
    let i = progress.lastSuccessfullyProcessedBatchIndex + 1;
    i < batches.length;
    i++
  ) {
    const batch = batches[i];
    const batchEntryIds = entryIdsInBatches[i];
    progress.lastAttemptedBatchIndex = i;
    console.log(
      `[${logPrefix}] Processing batch ${i + 1}/${batches.length} with ${
        batch.length
      } entries.`
    );

    let successInCurrentBatchAttempt = false;
    let attemptError: string | undefined;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        if (
          logPrefix === "SubgraphDump" && // This corresponds to Portal data now
          !contractInstance.functions.processSubgraphData
        ) {
          throw new Error(
            "Function processSubgraphData does not exist on the contract instance."
          );
        }
        if (
          logPrefix === "HistoricalRecords" && // This corresponds to Aavegotchi data now
          !contractInstance.functions.processHistoricalAavegotchiData
        ) {
          throw new Error(
            "Function processHistoricalAavegotchiData does not exist on the contract instance."
          );
        }
        if (
          logPrefix === "ClaimedAtEvents" &&
          !contractInstance.functions.emitClaimedEvent
        ) {
          throw new Error(
            "Function emitClaimedEvent does not exist on the contract instance."
          );
        }

        const tx = await contractCall(batch);
        console.log(
          `[${logPrefix}] Batch ${i + 1} transaction sent: ${
            tx.hash
          }. Waiting for confirmation...`
        );
        await tx.wait();

        console.log(`[${logPrefix}] Batch ${i + 1} transaction confirmed.`);
        successInCurrentBatchAttempt = true;
        attemptError = undefined;
        break;
      } catch (error: any) {
        attemptError = error.message || JSON.stringify(error);
        if (error.code === "CALL_EXCEPTION") {
          attemptError = `CALL_EXCEPTION: ${
            error.reason ? error.reason : JSON.stringify(error.error || error)
          }`;
        }
        console.error(
          `[${logPrefix}] Error processing batch ${i + 1}, attempt ${
            retry + 1
          }/${MAX_RETRIES}: `,
          attemptError
        );
        if (retry < MAX_RETRIES - 1) {
          console.log(
            `[${logPrefix}] Retrying in ${RETRY_DELAY_MS / 1000} seconds...`
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          console.error(
            `[${logPrefix}] Batch ${i + 1} failed after ${MAX_RETRIES} retries.`
          );
        }
      }
    }

    const batchDetailIndex = progress.failedBatchDetails.findIndex(
      (bd) => bd.batchIndex === i
    );
    let existingBatchDetail =
      batchDetailIndex !== -1
        ? progress.failedBatchDetails[batchDetailIndex]
        : null;

    if (successInCurrentBatchAttempt) {
      progress.processedEntryIds.push(...batchEntryIds);
      progress.lastSuccessfullyProcessedBatchIndex = i;
      if (existingBatchDetail) {
        // If it failed previously but succeeded now
        existingBatchDetail.success = true;
        existingBatchDetail.attemptTimestamp = Date.now();
        existingBatchDetail.error = undefined;
      }
    } else {
      if (existingBatchDetail) {
        existingBatchDetail.attemptTimestamp = Date.now();
        existingBatchDetail.error = attemptError;
        existingBatchDetail.success = false;
      } else {
        progress.failedBatchDetails.push({
          batchIndex: i,
          attemptTimestamp: Date.now(),
          success: false,
          error: attemptError,
          entryIdsInBatch: batchEntryIds,
        });
      }
      if (!progress.currentRunFailedBatchIndexes.includes(i)) {
        progress.currentRunFailedBatchIndexes.push(i);
      }
      overallSuccess = false;
    }
    saveProgress(progressFilePath, progress);
  }

  if (
    progress.lastSuccessfullyProcessedBatchIndex === batches.length - 1 &&
    batches.length > 0
  ) {
    console.log(
      `[${logPrefix}] All batches for fetched data processed successfully.`
    );
    progress.completed = true;
    progress.completedAt = Date.now();
  } else if (entriesToProcess.length === 0 && jsonData.length > 0) {
    // Case where everything was already processed at the start
    // Already handled at the beginning of the function
  } else if (batches.length === 0 && entriesToProcess.length > 0) {
    // Should not happen if entriesToProcess > 0
    console.warn(
      `[${logPrefix}] No batches were created although there were entries to process.`
    );
  } else {
    console.log(
      `[${logPrefix}] Processing for fetched data partially completed or with failures. ${
        progress.failedBatchDetails.filter((b) => !b.success).length
      } batches failed in total (across all runs).`
    );
    if (progress.currentRunFailedBatchIndexes.length > 0) {
      console.log(
        `[${logPrefix}] Batches that failed in the current run (0-indexed): ${progress.currentRunFailedBatchIndexes.join(
          ", "
        )}`
      );
    }
  }
  saveProgress(progressFilePath, progress);
  return overallSuccess && progress.completed;
}

// === Default Progress Generators ===
function getDefaultSubgraphProgress(): ProcessingProgress {
  // For Portal data
  return {
    totalEntriesInSource: 0,
    processedEntryIds: [],
    lastAttemptedBatchIndex: -1,
    lastSuccessfullyProcessedBatchIndex: -1,
    failedBatchDetails: [],
    currentRunFailedBatchIndexes: [],
    startTime: 0,
    completed: false,
    completedAt: null,
  };
}

function getDefaultHistoricalProgress(): ProcessingProgress {
  // For Aavegotchi data
  return {
    totalEntriesInSource: 0,
    processedEntryIds: [],
    lastAttemptedBatchIndex: -1,
    lastSuccessfullyProcessedBatchIndex: -1,
    failedBatchDetails: [],
    currentRunFailedBatchIndexes: [],
    startTime: 0,
    completed: false,
    completedAt: null,
  };
}

function getDefaultClaimedAtEventsProgress(): ProcessingProgress {
  // For ClaimedAt event emission
  return {
    totalEntriesInSource: 0,
    processedEntryIds: [],
    lastAttemptedBatchIndex: -1,
    lastSuccessfullyProcessedBatchIndex: -1,
    failedBatchDetails: [],
    currentRunFailedBatchIndexes: [],
    startTime: 0,
    completed: false,
    completedAt: null,
  };
}

// === Specific Processing Functions ===

async function processSubgraphDumpData(
  contract: AavegotchiBridgeFacet,
  portalDataJson: SubgraphAavegotchiOrPortalData_Json[]
): Promise<boolean> {
  const contractCall: ContractCallFunction<
    ContractAavegotchiSubgraphPortalData
  > = (batch) => {
    return contract.processSubgraphData(batch);
  };

  return processFile<
    SubgraphAavegotchiOrPortalData_Json,
    ContractAavegotchiSubgraphPortalData,
    ProcessingProgress
  >(
    portalDataJson, // Pass fetched data directly
    SUBGRAPH_PROGRESS_FILE, // Progress file remains for Portals
    getDefaultSubgraphProgress,
    transformSubgraphEntryToContractFormat,
    contractCall,
    BATCH_SIZE_SUBGRAPH,
    "SubgraphDump", // Log prefix for Portal data
    contract // Pass contract instance for function existence check
  );
}

async function processHistoricalAavegotchiDataRecords(
  contract: AavegotchiBridgeFacet
): Promise<boolean> {
  console.log(
    "[AavegotchiData] Fetching Aavegotchi historical data from subgraph..."
  );
  let aavegotchiDataJson: JsonAavegotchiHistoricalEntry[];
  try {
    aavegotchiDataJson =
      await fetchPaginatedGraphQLData<JsonAavegotchiHistoricalEntry>(
        GET_AAVEGOTCHIS_QUERY,
        "aavegotchis", // entity name
        "id", // orderBy field
        "asc" // orderDirection
      );
    console.log(
      `[AavegotchiData] Successfully fetched ${aavegotchiDataJson.length} Aavegotchi entries.`
    );
  } catch (error: any) {
    console.error(
      "[AavegotchiData] CRITICAL: Failed to fetch Aavegotchi data from subgraph:",
      error.message || error
    );
    return false;
  }

  const contractCall: ContractCallFunction<
    ContractAavegotchiHistoricalRecord
  > = (batch) => {
    // Ensure TypeChain correctly generated `processHistoricalAavegotchiData`
    return contract.processHistoricalAavegotchiData(batch);
  };

  return processFile<
    JsonAavegotchiHistoricalEntry,
    ContractAavegotchiHistoricalRecord,
    ProcessingProgress
  >(
    aavegotchiDataJson, // Pass fetched data directly
    HISTORICAL_PROGRESS_FILE, // Progress file remains for Aavegotchis
    getDefaultHistoricalProgress,
    transformHistoricalEntryToContractFormat,
    contractCall,
    BATCH_SIZE_HISTORICAL,
    "HistoricalRecords", // Log prefix for Aavegotchi data
    contract // Pass contract instance for function existence check
  );
}

async function processClaimedAtEvents(
  contract: AavegotchiBridgeFacet,
  portalDataJson: SubgraphAavegotchiOrPortalData_Json[]
): Promise<boolean> {
  console.log(
    "[ClaimedAtEvents] Using pre-fetched portal data for emitting ClaimedAt events..."
  );

  // Filter for portals that are claimed (claimedAt is not null)
  const claimedPortalsJson = portalDataJson.filter((p) => p.claimedAt !== null);
  console.log(
    `[ClaimedAtEvents] Found ${claimedPortalsJson.length} claimed portals to process.`
  );

  const contractCall: ContractCallFunction<ContractClaimedAtEventData> = (
    batch
  ) => {
    const tokenIds = batch.map((b) => b.tokenId);
    const claimedAtBlocks = batch.map((b) => b.claimedAtBlock);
    return contract.emitClaimedEvent(tokenIds, claimedAtBlocks);
  };

  return processFile<
    SubgraphAavegotchiOrPortalData_Json, // input json type
    ContractClaimedAtEventData, // contract data type
    ProcessingProgress
  >(
    claimedPortalsJson, // Pass filtered data
    CLAIMED_AT_EVENTS_PROGRESS_FILE,
    getDefaultClaimedAtEventsProgress,
    transformPortalToClaimedAtEvent,
    contractCall,
    BATCH_SIZE_CLAIMED_AT,
    "ClaimedAtEvents", // New log prefix
    contract
  );
}

// === Main Orchestration Function ===
async function main() {
  console.log(
    "Starting Aavegotchi chain data processing script (dynamic fetching)..."
  );
  if (!AAVEGOTCHI_SUBGRAPH_URL) {
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    console.error(
      "!!! IMPORTANT: You MUST configure AAVEGOTCHI_SUBGRAPH_URL in the script !!!"
    );
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    throw new Error("GraphQL endpoint URL is not configured.");
  }

  // @ts-ignore
  const signer = await getRelayerSigner(hre);

  console.log("Using relayer account:", await signer.getAddress());

  const network = await ethers.provider.getNetwork();
  console.log(
    "Operating on network:",
    network.name,
    "(chainId:",
    network.chainId,
    ")"
  );

  const contractAddresses = await varsForNetwork(ethers);
  if (!contractAddresses.aavegotchiDiamond) {
    throw new Error(
      "Aavegotchi Diamond address not found for this network. Check helpers/constants.ts"
    );
  }

  const bridgeFacet = (await ethers.getContractAt(
    "AavegotchiBridgeFacet",
    contractAddresses.aavegotchiDiamond,
    signer
  )) as AavegotchiBridgeFacet;
  console.log(`Attached to AavegotchiBridgeFacet at ${bridgeFacet.address}`);

  // Execution Order: 1. Aavegotchi History, 2. Portal Data, 3. ClaimedAt Events

  let historicalSuccess = false;
  try {
    console.log(
      "--- Starting Aavegotchi Historical Records Processing (Fetched from Subgraph) ---"
    );
    // Historical data is fetched inside this function as it's a different query
    historicalSuccess = await processHistoricalAavegotchiDataRecords(
      bridgeFacet
    );
    if (historicalSuccess) {
      console.log(
        "--- Aavegotchi Historical Records Processing Completed Successfully ---"
      );
    } else {
      console.error(
        "--- Aavegotchi Historical Records Processing Failed or Partially Completed ---"
      );
    }
  } catch (error: any) {
    console.error(
      "CRITICAL ERROR during Aavegotchi Historical Records Processing:",
      error.message || error,
      error.stack
    );
    historicalSuccess = false;
  }

  if (!historicalSuccess) {
    console.warn(
      "Skipping further processing due to failure in Aavegotchi Historical Records Processing."
    );
    process.exit(1);
  }

  console.log("[Main] Fetching all Portal data once...");
  let portalDataJson: SubgraphAavegotchiOrPortalData_Json[];
  try {
    portalDataJson =
      await fetchPaginatedGraphQLData<SubgraphAavegotchiOrPortalData_Json>(
        GET_PORTALS_QUERY,
        "portals",
        "id",
        "asc"
      );
    console.log(
      `[Main] Successfully fetched ${portalDataJson.length} total portal entries.`
    );
  } catch (error: any) {
    console.error(
      "[Main] CRITICAL: Failed to fetch Portal data. Aborting script.",
      error.message || error
    );
    process.exit(1); // Exit if initial fetch fails
  }

  let portalDataSuccess = false;
  try {
    console.log(
      "--- Starting Portal Data Processing (Using pre-fetched data) ---"
    );
    portalDataSuccess = await processSubgraphDumpData(
      bridgeFacet,
      portalDataJson
    );
    if (portalDataSuccess) {
      console.log("--- Portal Data Processing Completed Successfully ---");
    } else {
      console.error(
        "--- Portal Data Processing Failed or Partially Completed ---"
      );
    }
  } catch (error: any) {
    console.error(
      "CRITICAL ERROR during Portal Data Processing:",
      error.message || error,
      error.stack
    );
    portalDataSuccess = false; // Ensure it's marked as failed
  }

  if (portalDataSuccess) {
    try {
      console.log(
        "--- Starting Emission of ClaimedAt Events (Using pre-fetched data) ---"
      );
      const claimedAtSuccess = await processClaimedAtEvents(
        bridgeFacet,
        portalDataJson
      );
      if (claimedAtSuccess) {
        console.log("--- ClaimedAt Event Emission Completed Successfully ---");
      } else {
        console.error(
          "--- ClaimedAt Event Emission Failed or Partially Completed ---"
        );
      }
    } catch (error: any) {
      console.error(
        "CRITICAL ERROR during ClaimedAt Event Emission:",
        error.message || error,
        error.stack
      );
    }
  } else {
    console.warn(
      "Skipping ClaimedAt Event Emission due to failure in a previous step."
    );
  }

  console.log("Script finished.");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Unhandled error in main execution:", error);
      process.exit(1);
    });
}

console.log("Script setup complete. Main execution will follow.");
