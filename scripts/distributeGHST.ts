import { run } from "hardhat";

async function main() {
  try {
    console.log("Starting GHST distribution...");

    // Amount of GHST to distribute (400,000 GHST for SZN1)
    const amount = "400000";

    console.log(`Distributing ${amount} GHST based on leaderboard results...`);

    await run("distribute-ghst", {
      amount: amount,
    });

    console.log("Distribution complete!");
  } catch (error) {
    console.error("Error in distribution script:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
