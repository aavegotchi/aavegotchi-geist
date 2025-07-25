import { HardhatRuntimeEnvironment } from "hardhat/types";
import { loadDeploymentConfig } from "./deployFullDiamond";
import {
  AavegotchiFacet,
  AavegotchiGameFacet,
  ForgeDAOFacet,
} from "../typechain";
import { ethers } from "hardhat";
import { varsForNetwork } from "../helpers/constants";

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const forgeDiamondAddress = loadDeploymentConfig(63157)
    .forgeDiamond as string;
  const c = await varsForNetwork(ethers);

  const signer = (await ethers.getSigners())[0];

  // Get contract
  const forgeFacet = (await hre.ethers.getContractAt(
    "AavegotchiGameFacet",
    c.aavegotchiDiamond!
  )) as AavegotchiGameFacet;

  // Pause forge
  const tx = await forgeFacet.portalAavegotchiTraits(2590);
  console.log(tx);

  console.log("Forge has been paused");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
