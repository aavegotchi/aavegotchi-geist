import fs from "fs";
import path from "path";
import axios from "axios";

interface AccountData {
  address: string;
  balance: string;
  // Add other fields that might be in the response
}

interface StoredData {
  lastUpdated: string;
  accounts: AccountData[];
}

async function fetchGHSTBalances() {
  const outputPath = path.join(process.cwd(), "data", "ghst-balances.json");
  console.log(`Output file will be saved to: ${outputPath}`);

  // Create data directory if it doesn't exist
  const dataDir = path.join(process.cwd(), "data");
  console.log(`Checking if data directory exists at: ${dataDir}`);
  if (!fs.existsSync(dataDir)) {
    console.log(`Data directory doesn't exist. Creating it now...`);
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Data directory created successfully.`);
  } else {
    console.log(`Data directory already exists.`);
  }

  // Initialize or load existing data
  let storedData: StoredData = { lastUpdated: "", accounts: [] };
  if (fs.existsSync(outputPath)) {
    try {
      const fileContent = fs.readFileSync(outputPath, "utf-8");
      storedData = JSON.parse(fileContent);
      console.log(
        `Loaded existing data with ${storedData.accounts.length} accounts`
      );
    } catch (error) {
      console.error("Error reading existing file:", error);
    }
  }

  let page = 1;
  let hasMoreResults = true;

  console.log("Starting to fetch GHST balances...");

  while (hasMoreResults) {
    try {
      console.log(`Fetching page ${page}...`);
      const response = await axios.get(
        `https://geist-mainnet.explorer.alchemy.com/api?module=account&action=listaccounts&page=${page}`
      );

      if (response.data.status === "1" && Array.isArray(response.data.result)) {
        const results = response.data.result as AccountData[];

        if (results.length === 0) {
          hasMoreResults = false;
          console.log("No more results found. Finishing...");
        } else {
          // Append new results to existing accounts
          storedData.accounts = [...storedData.accounts, ...results];
          console.log(`Added ${results.length} accounts from page ${page}`);

          // Update the last updated timestamp
          storedData.lastUpdated = new Date().toISOString();

          // Save data to the JSON file after each page
          try {
            fs.writeFileSync(outputPath, JSON.stringify(storedData, null, 2));
            console.log(`Successfully wrote file after page ${page}`);
            console.log(
              `Current total: ${storedData.accounts.length} accounts`
            );
          } catch (error) {
            console.error(`Error writing to file after page ${page}:`, error);
          }

          page++;

          // Optional: Add a delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } else {
        console.error("Unexpected API response format:", response.data);
        hasMoreResults = false;
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      hasMoreResults = false;
    }
  }

  console.log(`Completed fetching GHST balances`);
  console.log(`Final count: ${storedData.accounts.length} accounts`);
  console.log(`Last updated: ${storedData.lastUpdated}`);
}

// Execute the function if this file is run directly
if (require.main === module) {
  fetchGHSTBalances()
    .then(() => console.log("Finished fetching GHST balances"))
    .catch((error) => console.error("Error in fetchGHSTBalances:", error));
}

// Export the function for use in other scripts
export { fetchGHSTBalances };
