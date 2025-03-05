import { formatEther } from "ethers/lib/utils";
import fs from "fs";
import path from "path";

interface AccountData {
  address: string;
  balance: string;
  // Add other fields that might be in the response
}

interface StoredData {
  lastUpdated: string;
  accounts: AccountData[];
}

interface TallyResult {
  totalWallets: number;
  totalBalance: string;
  totalBalanceFormatted: string;
  lastUpdated: string;
}

/**
 * Tallies statistics from the GHST balances JSON file
 * @returns Object containing wallet count and total balance statistics
 */
async function tallyGHSTBalances(): Promise<TallyResult> {
  const filePath = path.join(process.cwd(), "data", "ghst-balances.json");
  console.log(`Reading GHST balances from: ${filePath}`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `File not found: ${filePath}. Run fetchGHSTBalances.ts first.`
    );
  }

  // Read and parse the JSON file
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data: StoredData = JSON.parse(fileContent);

    // Count wallets
    const totalWallets = data.accounts.length;

    // Sum balances (in wei)
    let totalBalanceWei = BigInt(0);
    for (const account of data.accounts) {
      // Handle potential non-numeric or empty balances
      if (account.balance && !isNaN(Number(account.balance))) {
        totalBalanceWei += BigInt(account.balance);
      }
    }

    // Format the result
    const totalBalance = totalBalanceWei.toString();
    const totalBalanceFormatted = formatEther(totalBalanceWei);

    const result: TallyResult = {
      totalWallets,
      totalBalance,
      totalBalanceFormatted,
      lastUpdated: data.lastUpdated,
    };

    // Log the results
    console.log("=== GHST Balance Statistics ===");
    console.log(`Total wallets: ${result.totalWallets.toLocaleString()}`);
    console.log(`Total GHST: ${result.totalBalanceFormatted}`);
    console.log(`Last updated: ${result.lastUpdated}`);

    //Compare this to the total GHST in the bridge contract: https://basescan.org/address/0x9f904fea0eff79708b37b99960e05900fe310a8e#tokentxns

    return result;
  } catch (error) {
    console.error("Error processing GHST balances file:", error);
    throw error;
  }
}

// Execute the function if this file is run directly
if (require.main === module) {
  tallyGHSTBalances()
    .then(() => console.log("Finished tallying GHST balances"))
    .catch((error) => console.error("Error in tallyGHSTBalances:", error));
}

// Export the function for use in other scripts
export { tallyGHSTBalances };
