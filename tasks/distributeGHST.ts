import { task } from "hardhat/config";
import { GraphQLClient, gql } from "graphql-request";

const baseUrl =
  "https://subgraph.satsuma-prod.com/tWYl5n5y04oz/aavegotchi/agc-subgraph-geist/api";

interface LeaderboardEntry {
  id: string;
  gotchiPoints: string;
}

interface DistributionResult {
  address: string;
  amount: string;
}

function getMultiplierForRank(rank: number): number {
  // Multipliers from SZN1 leaderboard
  const multipliers = {
    1: 10,
    2: 8,
    3: 6,
    4: 5,
    5: 5,
    6: 5,
    7: 5,
    8: 5,
    9: 5,
    10: 5,
    11: 3.5,
    12: 3.5,
    13: 3.5,
    14: 3.5,
    15: 3.5,
    16: 3.5,
    17: 3.5,
    18: 3.5,
    19: 3.5,
    20: 3.5,
    21: 3.5,
    22: 3.5,
    23: 3.5,
    24: 3.5,
    25: 3.5,
    26: 3,
    27: 3,
    28: 3,
    29: 3,
    30: 3,
    31: 3,
    32: 3,
    33: 3,
    34: 3,
    35: 3,
    36: 3,
    37: 3,
    38: 3,
    39: 3,
    40: 3,
    41: 3,
    42: 3,
    43: 3,
    44: 3,
    45: 3,
    46: 3,
    47: 3,
    48: 3,
    49: 3,
    50: 3,
    51: 2,
    52: 2,
    53: 2,
    54: 2,
    55: 2,
    56: 2,
    57: 2,
    58: 2,
    59: 2,
    60: 2,
    61: 2,
    62: 2,
    63: 2,
    64: 2,
    65: 2,
    66: 2,
    67: 2,
    68: 2,
    69: 2,
    70: 2,
    71: 2,
    72: 2,
    73: 2,
    74: 2,
    75: 2,
    76: 2,
    77: 2,
    78: 2,
    79: 2,
    80: 2,
    81: 2,
    82: 2,
    83: 2,
    84: 2,
    85: 2,
    86: 2,
    87: 2,
    88: 2,
    89: 2,
    90: 2,
    91: 2,
    92: 2,
    93: 2,
    94: 2,
    95: 2,
    96: 2,
    97: 2,
    98: 2,
    99: 2,
    100: 2,
  };
  return multipliers[rank as keyof typeof multipliers] || 1; // Default to 1x for other ranks
}

task("distribute-ghst", "Distribute GHST tokens based on leaderboard results")
  .addParam("amount", "Total amount of GHST to distribute")
  .setAction(async (taskArgs, hre) => {
    try {
      const client = new GraphQLClient(baseUrl);

      // Query to get leaderboard data
      const query = gql`
        query GetLeaderboard {
          accounts(
            first: 1000
            orderBy: gotchiPoints
            orderDirection: desc
            where: { gotchiPoints_gt: "0" }
          ) {
            id
            gotchiPoints
          }
        }
      `;

      const data = await client.request(query);

      console.log("data", data);

      const leaderboard = data.accounts as LeaderboardEntry[];

      let totalWeightedPoints = 0;
      const weightedPointsMap = new Map<string, number>();

      // Calculate weighted points for each address
      for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const points = Number(hre.ethers.utils.formatEther(entry.gotchiPoints));
        const multiplier = getMultiplierForRank(i + 1);
        const weightedPoints = points * multiplier;

        weightedPointsMap.set(entry.id, weightedPoints);
        totalWeightedPoints += weightedPoints;
      }

      // Calculate distribution amounts
      const totalAmount = hre.ethers.utils.parseEther(taskArgs.amount);
      const distribution: DistributionResult[] = [];

      for (const [address, weightedPoints] of weightedPointsMap) {
        const share = weightedPoints / totalWeightedPoints;
        const amount = totalAmount.mul(Math.floor(share * 10000)).div(10000);
        distribution.push({
          address,
          amount: hre.ethers.utils.formatEther(amount),
        });
      }

      // Sort by amount in descending order
      distribution.sort((a, b) => Number(b.amount) - Number(a.amount));

      // Save distribution to file
      const fs = require("fs");
      fs.writeFileSync(
        "ghst-distribution.json",
        JSON.stringify(distribution, null, 2)
      );

      console.log(`Distribution saved to ghst-distribution.json`);
      console.log(`Total addresses: ${distribution.length}`);
      console.log(`Total weighted points: ${totalWeightedPoints}`);

      // Log top 10 recipients
      console.log("\nTop 10 recipients:");
      distribution.slice(0, 10).forEach((entry, index) => {
        console.log(
          `${index + 1}. ${entry.address}: ${
            entry.amount
          } GHST (weighted points: ${weightedPointsMap.get(
            entry.address
          )}) percentage total: ${
            (Number(entry.amount) / Number(taskArgs.amount)) * 100
          }%`
        );
      });
    } catch (error) {
      console.error("Error distributing GHST:", error);
    }
  });
