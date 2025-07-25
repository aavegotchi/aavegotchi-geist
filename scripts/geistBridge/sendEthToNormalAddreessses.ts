import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { getRelayerSigner, delay } from "../helperFunctions";

// Where we persist which addresses already received funds
const PROCESSED_PATH = path.join(__dirname, "processed");
const PROGRESS_FILE = path.join(
  PROCESSED_PATH,
  "eth-distribution-progress.json"
);

interface ProgressRecord {
  [address: string]: string; // txHash
}

function loadProgress(): ProgressRecord {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch (e: any) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

function saveProgress(record: ProgressRecord) {
  if (!fs.existsSync(PROCESSED_PATH))
    fs.mkdirSync(PROCESSED_PATH, { recursive: true });
  const tmp = PROGRESS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, PROGRESS_FILE);
}

// Path to the JSON snapshot
const SNAPSHOT_PATH = path.join(
  __dirname,
  "cloneData/aavegotchi/aavegotchi-regular.json"
);

// Amount to send to each address (0.0001 ETH)
const AMOUNT_WEI = ethers.utils.parseEther("0.0001");

// Optional – milliseconds to wait between transactions to avoid provider rate-limits
const INTER_TX_DELAY = 2;

async function main() {
  // @ts-ignore – Hardhat injects the global `hre`
  const signer = await getRelayerSigner(hre);
  const signerAddress = await signer.getAddress();
  console.log("Using relayer:", signerAddress);

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Snapshot file not found: ${SNAPSHOT_PATH}`);
  }

  const raw: Record<string, string[]> = JSON.parse(
    fs.readFileSync(SNAPSHOT_PATH, "utf8")
  );

  const uniqueAddresses = Object.keys(raw).map((a) => a.toLowerCase());

  // Load progress
  const progress = loadProgress();

  const pending = uniqueAddresses.filter((a) => !progress[a]);

  console.log(
    `Total unique addresses: ${uniqueAddresses.length}. Pending transfers: ${pending.length}`
  );

  // let nonce = await signer.getTransactionCount();
  let sent = 0;

  for (const addr of pending) {
    if (!ethers.utils.isAddress(addr)) {
      console.warn("Skipping invalid address:", addr);
      continue;
    }
    try {
      const tx = await signer.sendTransaction({
        to: addr,
        value: AMOUNT_WEI,
        // nonce: nonce++,
      });
      console.log(`Sent 0.0001 ETH to ${addr} → tx ${tx.hash}`);
      await tx.wait(1);
      sent++;
      // update progress
      progress[addr] = tx.hash;
      saveProgress(progress);
      if (INTER_TX_DELAY) await delay(INTER_TX_DELAY);
    } catch (err: any) {
      console.error(`Failed to send to ${addr}:`, err.message || err);
    }
  }

  console.log(
    `\nCompleted. Successful transfers this run: ${sent}/${
      pending.length
    }. Total processed overall: ${Object.keys(progress).length}`
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
