import { ethers } from "hardhat";
import { expect } from "chai";

import { deploy } from "../js/diamond-util/src";
import { DeploymentConfig } from "../scripts/deployFullDiamond";

import { AavegotchiBridgeFacet, WearablesConfigFacet, WearablesConfigReenterer } from "../typechain";

describe("WearablesConfigFacet: reentrancy", function () {
  it("stores the config before paying the owner fee (prevents slot/id desync on reentrancy)", async function () {
    this.timeout(300000);

    const [deployer, caller] = await ethers.getSigners();

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deploymentConfig = { chainId } as DeploymentConfig;

    const initArgs = [
      [
        deployer.address, // dao
        deployer.address, // daoTreasury
        deployer.address, // pixelCraft
        deployer.address, // rarityFarming
        deployer.address, // ghstContract (unused here)
        deployer.address, // vrfSystem (unused here)
        deployer.address, // relayerPetter (unused here)
      ],
    ];

    const { deployedDiamond } = await deploy({
      diamondName: "AavegotchiDiamond",
      initDiamond: "contracts/Aavegotchi/InitDiamond.sol:InitDiamond",
      facetNames: ["WearablesConfigFacet", "AavegotchiBridgeFacet"],
      signer: deployer,
      args: initArgs,
      deploymentConfig,
    });

    const diamondAddress = deployedDiamond.address;

    const bridge = (await ethers.getContractAt(
      "AavegotchiBridgeFacet",
      diamondAddress,
      deployer
    )) as AavegotchiBridgeFacet;

    const wearablesConfig = (await ethers.getContractAt(
      "WearablesConfigFacet",
      diamondAddress,
      caller
    )) as WearablesConfigFacet;

    const reentererFactory = await ethers.getContractFactory(
      "WearablesConfigReenterer",
      deployer
    );
    const reenterer = (await reentererFactory.deploy(
      diamondAddress
    )) as WearablesConfigReenterer;
    await reenterer.deployed();

    const tokenId = 1;
    await reenterer.configure(tokenId, "inner");

    // Bridge in a gotchi owned by the reenterer contract.
    // Only the owner check matters here: WearablesConfigFacet requires status == AAVEGOTCHI.
    const bridged = {
      equippedWearables: Array(16).fill(0),
      temporaryTraitBoosts: Array(6).fill(0),
      numericTraits: Array(6).fill(0),
      name: "reenterOwnerGotchi",
      randomNumber: 0,
      experience: 0,
      minimumStake: 0,
      usedSkillPoints: 0,
      interactionCount: 0,
      collateralType: ethers.constants.AddressZero,
      claimTime: 0,
      lastTemporaryBoost: 0,
      hauntId: 1,
      owner: reenterer.address,
      status: 3, // LibAavegotchi.STATUS_AAVEGOTCHI
      lastInteracted: 0,
      locked: false,
      escrow: ethers.constants.AddressZero, // ignored; setMetadata deploys a new escrow
      respecCount: 0,
      baseRandomNumber: 0,
    };

    await (await bridge.setMetadata([tokenId], [bridged])).wait();

    const outerWearables = Array(16).fill(0);

    // Sender != owner, so an owner fee is paid to `owner` (reenterer), triggering reentrancy.
    await (
      await wearablesConfig.createWearablesConfig(tokenId, "outer", outerWearables, {
        value: ethers.utils.parseEther("0.1"),
      })
    ).wait();

    expect(await reenterer.didReenter()).to.equal(true);
    expect(await wearablesConfig.getAavegotchiWearablesConfigCount(reenterer.address, tokenId)).to.equal(2);

    // The outer call should create id 0 (and persist it before paying the owner fee).
    expect(await wearablesConfig.getWearablesConfigName(reenterer.address, tokenId, 0)).to.equal("outer");
    expect(await wearablesConfig.getWearablesConfigName(reenterer.address, tokenId, 1)).to.equal("inner");
  });
});

