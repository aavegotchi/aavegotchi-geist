import { ethers } from "ethers";
import path from "path";
import { ethers as eh } from "hardhat";
import fs from "fs";
import axios from "axios";
import * as dotenv from "dotenv";
import {
  baseProvider,
  baseSepoliaProvider,
  varsForNetwork,
} from "../../helpers/constants";
import { getRelayerSigner } from "../helperFunctions";
import { GNOSIS_PATH, PROCESSED_PATH } from "./paths";

// Use absolute path resolution
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FAILED_SAFES_PATH = `${GNOSIS_PATH}/failedSafes.json`;
const DEPLOYED_SAFES_PATH = `${GNOSIS_PATH}/deployedSafes.json`;

const toBase = false; //TO-DO: change to true during mainnet deployment

//create processed directory if it doesn't exist
if (!fs.existsSync(PROCESSED_PATH)) {
  fs.mkdirSync(PROCESSED_PATH, { recursive: true });
}

// Create gnosis directory if it doesn't exist
if (!fs.existsSync(GNOSIS_PATH)) {
  fs.mkdirSync(GNOSIS_PATH, { recursive: true });
}

// Initialize empty files if they don't exist
if (!fs.existsSync(FAILED_SAFES_PATH)) {
  fs.writeFileSync(FAILED_SAFES_PATH, JSON.stringify([], null, 2));
}

if (!fs.existsSync(DEPLOYED_SAFES_PATH)) {
  fs.writeFileSync(DEPLOYED_SAFES_PATH, JSON.stringify([], null, 2));
}

function recordFailedSafe(safeAddress: string) {
  const failedSafes: string[] = fs.existsSync(FAILED_SAFES_PATH)
    ? JSON.parse(fs.readFileSync(FAILED_SAFES_PATH, "utf8"))
    : [];

  if (!failedSafes.includes(safeAddress)) {
    failedSafes.push(safeAddress);
    fs.writeFileSync(FAILED_SAFES_PATH, JSON.stringify(failedSafes, null, 2));
  }
}

function recordDeployedSafe(safeAddress: string) {
  const deployedSafes: string[] = fs.existsSync(DEPLOYED_SAFES_PATH)
    ? JSON.parse(fs.readFileSync(DEPLOYED_SAFES_PATH, "utf8"))
    : [];

  if (!deployedSafes.includes(safeAddress)) {
    deployedSafes.push(safeAddress);
    fs.writeFileSync(
      DEPLOYED_SAFES_PATH,
      JSON.stringify(deployedSafes, null, 2)
    );
  }
}

async function getCreationTxnData(safeAddress: string): Promise<string> {
  const polygonscanApiKey = process.env.POLYGON_API_KEY;
  if (!polygonscanApiKey) {
    throw new Error("POLYGONSCAN_API_KEY not set in environment");
  }

  // First get the creation transaction hash
  const creationUrl = `https://api.polygonscan.com/api?module=contract&action=getcontractcreation&contractaddresses=${safeAddress}&apikey=${polygonscanApiKey}`;

  const creationResponse = await axios.get(creationUrl);

  if (
    creationResponse.data.status !== "1" ||
    !creationResponse.data.result?.length
  ) {
    throw new Error(`Failed to get creation details for safe ${safeAddress}`);
  }

  const creationTxHash = creationResponse.data.result[0].txHash;

  // Then get the full transaction details
  const txUrl = `https://api.polygonscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${creationTxHash}&apikey=${polygonscanApiKey}`;

  const txResponse = await axios.get(txUrl);
  if (!txResponse.data.result) {
    throw new Error(
      `Failed to get transaction details for hash ${creationTxHash}`
    );
  }

  return txResponse.data.result.input;
}

export async function deploySafe(safeAddress: string): Promise<string | null> {
  try {
    const networkVars = await varsForNetwork(eh);
    const SAFE_PROXY_FACTORY = networkVars.safeProxyFactory;

    const privateKey = process.env.SECRET;
    if (!privateKey) {
      throw new Error("Private key not found in environment variables");
    }

    const provider = toBase ? baseProvider() : baseSepoliaProvider();

    // Check if safe already exists

    const code = await provider.getCode(safeAddress);
    if (code !== "0x") {
      console.log(
        `Safe ${safeAddress} already exists on ${provider.network.chainId}, skipping deployment...`
      );
      recordDeployedSafe(safeAddress);
      return safeAddress;
    }

    console.log(`Deploying safe ${safeAddress} to Base...`);

    // Get creation transaction data
    const inputData = await getCreationTxnData(safeAddress);
    // @ts-ignore
    const signer = await getRelayerSigner(hre);

    const tx = await signer.sendTransaction({
      to: SAFE_PROXY_FACTORY,
      data: inputData,
    });

    const receipt = await tx.wait();

    if (receipt.status === 1) {
      const PROXY_CREATION_EVENT =
        "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235";
      const event = receipt.logs.find(
        (log) => log.topics[0] === PROXY_CREATION_EVENT
      );

      if (!event) {
        console.error("ProxyCreation event not found in logs");
        recordFailedSafe(safeAddress);
        return null;
      }

      const iface = new ethers.utils.Interface([
        "event ProxyCreation(address proxy, address singleton)",
      ]);
      const decodedEvent = iface.parseLog(event);
      const deployedAddress = decodedEvent.args.proxy;

      if (deployedAddress.toLowerCase() !== safeAddress.toLowerCase()) {
        console.error(
          `❗Deployed address ${deployedAddress} does not match expected ${safeAddress}`
        );
        recordFailedSafe(safeAddress);
        return null;
      }

      console.log(`✅Successfully deployed safe to ${safeAddress} on Base`);
      recordDeployedSafe(safeAddress);
      return safeAddress;
    } else {
      recordFailedSafe(safeAddress);
      return null;
    }
  } catch (error) {
    console.error("Deployment error:", error);
    recordFailedSafe(safeAddress);
    return null;
  }
}
