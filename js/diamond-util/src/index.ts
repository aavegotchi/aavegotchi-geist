/* global ethers */

import { ethers } from "hardhat";
import {
  Contract,
  ContractFactory,
  BigNumberish,
  BytesLike,
  Signer,
  providers,
} from "ethers";
import {
  DeploymentConfig,
  saveDeploymentConfig,
} from "../../../scripts/deployFullDiamond";
import { verifyContract } from "../../../scripts/helperFunctions"; // verifyContract might be needed if it was used before

export const FacetCutAction = {
  Add: 0,
  Replace: 1,
  Remove: 2,
};

function getSignatures(contract: Contract) {
  return Object.keys(contract.interface.functions);
}

export function getSelectors(contract: Contract): string[] {
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc: string[], val: string) => {
    if (val !== "init(bytes)") {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, [] as string[]);
  return selectors;
}

export async function deployFacets(
  facets: any[],
  diamondName: string,
  deploymentConfig: DeploymentConfig,
  signer: Signer
) {
  console.log("--");
  const deployed = [];
  const existingFacets = deploymentConfig[diamondName]?.facets || {};

  for (const facet of facets) {
    if (Array.isArray(facet)) {
      if (typeof facet[0] !== "string") {
        throw Error(
          `Error using facet: facet name must be a string. Bad input: ${facet[0]}`
        );
      }
      if (!(facet[1] instanceof ethers.Contract)) {
        throw Error(
          `Error using facet: facet must be a Contract. Bad input: ${facet[1]}`
        );
      }
      console.log(`Using already deployed ${facet[0]}: ${facet[1].address}`);
      console.log("--");
      deployed.push(facet);
    } else {
      if (typeof facet !== "string") {
        throw Error(
          `Error deploying facet: facet name must be a string. Bad input: ${facet}`
        );
      }

      if (existingFacets[facet]) {
        console.log(
          `Using existing ${facet} from config: ${existingFacets[facet]}`
        );
        const existingContract = await ethers.getContractAt(
          facet,
          existingFacets[facet],
          signer
        );
        deployed.push([facet, existingContract]);
      } else {
        const facetFactory = await ethers.getContractFactory(facet, signer);
        console.log(`Deploying ${facet}`);

        const deployedFactory = await facetFactory.deploy();
        const receipt = await deployedFactory.deployTransaction.wait();

        if (receipt.status !== 1) {
          throw new Error(
            `Deployment of ${facet} failed. Receipt: ${JSON.stringify(receipt)}`
          );
        }
        await verifyContract(deployedFactory.address, false);

        if (!deploymentConfig[diamondName]) {
          deploymentConfig[diamondName] = {
            name: diamondName,
            facets: {},
          };
        }
        if (!deploymentConfig[diamondName].facets) {
          deploymentConfig[diamondName].facets = {};
        }
        deploymentConfig[diamondName].facets[facet] = deployedFactory.address;
        await saveDeploymentConfig(deploymentConfig);

        console.log(
          `${facet} deployed: ${deployedFactory.address} (tx: ${receipt.transactionHash})`
        );
        console.log("--");
        deployed.push([facet, deployedFactory]);
      }
    }
  }
  return deployed;
}

interface DeployArgs {
  diamondName: string;
  initDiamond: string;
  facetNames: string[];
  signer: Signer;
  args?: any[];
  txArgs?: any;
  deploymentConfig: DeploymentConfig;
}

interface DiamondCutStruct {
  facetAddress: string;
  action: BigNumberish;
  functionSelectors: BytesLike[];
}

export async function deploy({
  diamondName,
  initDiamond: initDiamondName,
  facetNames,
  signer,
  args = [],
  txArgs = {},
  deploymentConfig,
}: DeployArgs) {
  if (arguments.length !== 1) {
    throw Error(
      `Requires only 1 map argument. ${arguments.length} arguments used.`
    );
  }

  const deployedFacets = await deployFacets(
    facetNames,
    diamondName,
    deploymentConfig,
    signer
  );
  const diamondFactory = await ethers.getContractFactory("Diamond", signer);
  let diamondCut: DiamondCutStruct[] = [];
  console.log("--");
  console.log("Setting up diamondCut args");
  console.log("--");

  const signatures = new Set<string>();
  for (const [name, deployedFacet] of deployedFacets) {
    console.log(name);
    console.log(getSignatures(deployedFacet));
    for (const signature of getSignatures(deployedFacet)) {
      if (signatures.has(signature)) {
        throw Error(`Duplicate selector: ${signature}`);
      }
      signatures.add(signature);
    }
    console.log("--");
    diamondCut.push({
      facetAddress: deployedFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(deployedFacet),
    });
  }
  console.log("--");

  console.log(`Deploying ${initDiamondName}`);
  const initDiamondFactory = await ethers.getContractFactory(
    initDiamondName,
    signer
  );
  const deployedInitDiamondContract = await initDiamondFactory.deploy();
  const initDiamondReceipt =
    await deployedInitDiamondContract.deployTransaction.wait();
  if (initDiamondReceipt.status !== 1) {
    throw new Error(
      `Deployment of ${initDiamondName} failed. Receipt: ${JSON.stringify(
        initDiamondReceipt
      )}`
    );
  }
  console.log(
    `${initDiamondName} deployed: ${deployedInitDiamondContract.address} (tx: ${initDiamondReceipt.transactionHash})`
  );
  await verifyContract(deployedInitDiamondContract.address, false);

  console.log("Encoding diamondCut init function call");
  const functionCall = deployedInitDiamondContract.interface.encodeFunctionData(
    "init",
    args
  );

  console.log(`Deploying ${diamondName}`);
  const ownerAddress = await signer.getAddress();
  const deployedDiamond = await diamondFactory.deploy(ownerAddress);
  const diamondReceipt = await deployedDiamond.deployTransaction.wait();
  if (diamondReceipt.status !== 1) {
    throw new Error(
      `Deployment of ${diamondName} failed. Receipt: ${JSON.stringify(
        diamondReceipt
      )}`
    );
  }
  await verifyContract(deployedDiamond.address, true, [ownerAddress]);

  console.log(
    "Diamond deploy transaction hash:" + deployedDiamond.deployTransaction.hash
  );
  console.log(`${diamondName} deployed: ${deployedDiamond.address}`);
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Reduced wait
  console.log(`Diamond owner: ${ownerAddress}`);

  const diamondCutFacet = (
    await ethers.getContractAt("DiamondCutFacet", deployedDiamond.address)
  ).connect(signer);

  console.log("diamond cut:", diamondCut);
  const tx = await diamondCutFacet.diamondCut(
    diamondCut,
    deployedInitDiamondContract.address,
    functionCall,
    txArgs
  );
  const diamondCutReceipt = await tx.wait();
  if (diamondCutReceipt.status !== 1) {
    throw new Error(
      `Diamond cut for ${diamondName} failed. Receipt: ${JSON.stringify(
        diamondCutReceipt
      )}`
    );
  }

  console.log("DiamondCut success!");
  console.log("Transaction hash:" + tx.hash);
  console.log("--");
  return {
    deployedDiamond,
    diamondReceipt,
    initDiamondReceipt,
    diamondCutReceipt,
  }; // Return receipts for gas tracking
}

interface DeployWithoutInitArgs {
  diamondName: string;
  facetNames: string[];
  signer: Signer;
  args?: any[];
  txArgs?: any;
  deploymentConfig: DeploymentConfig;
}

export async function deployWithoutInit({
  diamondName,
  facetNames,
  signer,
  args = [],
  txArgs = {},
  deploymentConfig,
}: DeployWithoutInitArgs) {
  if (arguments.length !== 1) {
    throw Error(
      `Requires only 1 map argument. ${arguments.length} arguments used.`
    );
  }

  const deployedFacets = await deployFacets(
    facetNames,
    diamondName,
    deploymentConfig,
    signer
  );

  const diamondFactory = await ethers.getContractFactory(diamondName, signer);
  let diamondCut: DiamondCutStruct[] = [];
  console.log("--");
  console.log("Setting up diamondCut args");
  console.log("--");
  for (const [name, deployedFacet] of deployedFacets) {
    console.log(name);
    console.log(getSignatures(deployedFacet));
    console.log("--");
    diamondCut.push({
      facetAddress: deployedFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(deployedFacet),
    });
  }
  console.log("--");
  console.log("diamond cut:", diamondCut);
  console.log(`Deploying ${diamondName}`);
  console.log(...args);

  const deployedDiamond = await diamondFactory.deploy(...args);
  const diamondReceipt = await deployedDiamond.deployTransaction.wait();
  if (diamondReceipt.status !== 1) {
    throw new Error(
      `Deployment of ${diamondName} (without init) failed. Receipt: ${JSON.stringify(
        diamondReceipt
      )}`
    );
  }

  console.log(
    "Diamond deploy transaction hash:" + deployedDiamond.deployTransaction.hash
  );
  console.log(`${diamondName} deployed: ${deployedDiamond.address}`);
  await new Promise((resolve) => setTimeout(resolve, 2000)); // Reduced wait

  const diamondCutFacet = (
    await ethers.getContractAt("DiamondCutFacet", deployedDiamond.address)
  ).connect(signer);

  const tx = await diamondCutFacet.diamondCut(
    diamondCut,
    ethers.constants.AddressZero,
    "0x",
    txArgs
  );
  const diamondCutReceipt = await tx.wait();
  if (diamondCutReceipt.status !== 1) {
    throw new Error(
      `Diamond cut for ${diamondName} (without init) failed. Receipt: ${JSON.stringify(
        diamondCutReceipt
      )}`
    );
  }

  console.log("DiamondCut success!");
  console.log("Transaction hash:" + tx.hash);
  console.log("--");
  return { deployedDiamond, diamondReceipt, diamondCutReceipt }; // Return receipts
}

export function inFacets(
  selector: string,
  facets: Array<{ functionSelectors: string[] }>
) {
  for (const facet of facets) {
    if (facet.functionSelectors.includes(selector)) {
      return true;
    }
  }
  return false;
}

export async function upgrade({
  diamondAddress,
  diamondCut,
  signer,
  txArgs = {},
  initFacetName = undefined,
  initArgs,
}: {
  diamondAddress: string;
  diamondCut: any;
  signer: Signer;
  txArgs?: any;
  initFacetName?: string;
  initArgs?: any;
}) {
  if (arguments.length !== 1) {
    throw Error(
      `Requires only 1 map argument. ${arguments.length} arguments used.`
    );
  }
  const diamondCutFacet = (
    await ethers.getContractAt("DiamondCutFacet", diamondAddress)
  ).connect(signer);
  const diamondLoupeFacet = (
    await ethers.getContractAt("DiamondLoupeFacet", diamondAddress)
  ).connect(signer); // Assuming loupe calls don't need specific signer if they are views, but good for consistency.

  const existingFacets = await diamondLoupeFacet.facets(); // This is a view call
  const facetFactories = new Map<string, ContractFactory | Contract>();

  console.log("Facet Signatures and Selectors: ");
  for (const facet of diamondCut) {
    const functions = new Map<string, string>();
    const selectors: string[] = [];
    console.log("Facet: " + facet);
    let facetName: string;
    let contract: Contract | undefined;
    if (Array.isArray(facet[0])) {
      facetName = facet[0][0] as string;
      contract = facet[0][1] as Contract;
      if (!(typeof facetName === "string")) {
        throw Error("First value in facet[0] array must be a string.");
      }
      if (!(contract instanceof ethers.Contract)) {
        throw Error(
          "Second value in facet[0] array must be a Contract object."
        );
      }
      facet[0] = facetName;
    } else {
      facetName = facet[0] as string;
      if (!(typeof facetName === "string") && facetName) {
        throw Error("facet[0] must be a string or an array or false.");
      }
    }
    for (const signature of facet[2] as string[]) {
      const selector = ethers.utils
        .keccak256(ethers.utils.toUtf8Bytes(signature))
        .slice(0, 10);
      console.log(`Function: ${selector} ${signature}`);
      selectors.push(selector);
      functions.set(selector, signature);
    }
    console.log("");
    if (facet[1] === FacetCutAction.Remove) {
      // Logic for Remove
      if (facetName) {
        throw Error(
          `Can't remove functions because facet name must have a false value not ${facetName}.`
        );
      }
      facet[0] = ethers.constants.AddressZero;
      for (const selector of selectors) {
        if (!inFacets(selector, existingFacets)) {
          const signature = functions.get(selector);
          throw Error(
            `Can't remove '${signature}'. It doesn't exist in deployed diamond.`
          );
        }
      }
      facet[2] = selectors;
    } else if (facet[1] === FacetCutAction.Replace) {
      // Logic for Replace
      let facetFactoryOrContract = facetFactories.get(facetName);
      if (!facetFactoryOrContract) {
        if (contract) {
          facetFactories.set(facetName, contract);
          facetFactoryOrContract = contract;
        } else {
          const factory = await ethers.getContractFactory(facetName, signer);
          facetFactories.set(facetName, factory);
          facetFactoryOrContract = factory;
        }
      }
      const functionsFromFactory =
        (facetFactoryOrContract as ContractFactory).interface?.functions ||
        (facetFactoryOrContract as Contract).interface?.functions;
      if (!functionsFromFactory) {
        throw Error(`Could not get interface functions from ${facetName}`);
      }
      for (const signature of facet[2] as string[]) {
        if (
          !Object.prototype.hasOwnProperty.call(functionsFromFactory, signature)
        ) {
          throw Error(
            `Can't replace '${signature}'. It doesn't exist in ${facetName} source code.`
          );
        }
      }
      for (const selector of selectors) {
        if (!inFacets(selector, existingFacets)) {
          const signature = functions.get(selector);
          throw Error(
            `Can't replace '${signature}'. It doesn't exist in deployed diamond.`
          );
        }
      }
      facet[2] = selectors;
    } else if (facet[1] === FacetCutAction.Add) {
      // Logic for Add
      let facetFactoryOrContract = facetFactories.get(facetName);
      if (!facetFactoryOrContract) {
        if (contract) {
          facetFactories.set(facetName, contract);
          facetFactoryOrContract = contract;
        } else {
          const factory = await ethers.getContractFactory(facetName, signer);
          facetFactories.set(facetName, factory);
          facetFactoryOrContract = factory;
        }
      }
      const functionsFromFactory =
        (facetFactoryOrContract as ContractFactory).interface?.functions ||
        (facetFactoryOrContract as Contract).interface?.functions;
      if (!functionsFromFactory) {
        throw Error(`Could not get interface functions from ${facetName}`);
      }
      for (const signature of facet[2] as string[]) {
        if (
          !Object.prototype.hasOwnProperty.call(functionsFromFactory, signature)
        ) {
          throw Error(
            `Can't add ${signature}. It doesn't exist in ${facetName} source code.`
          );
        }
      }
      for (const selector of selectors) {
        if (inFacets(selector, existingFacets)) {
          const signature = functions.get(selector);
          throw Error(
            `Can't add '${signature}'. It already exists in deployed diamond.`
          );
        }
      }
      facet[2] = selectors;
    } else {
      throw Error(
        "Incorrect FacetCutAction value. Must be 0, 1 or 2. Value used: " +
          facet[1]
      );
    }
  }

  const alreadDeployed = new Map<string, string>();
  for (const facet of diamondCut) {
    if (facet[1] !== FacetCutAction.Remove) {
      const facetNameStr = facet[0] as string;
      const existingAddress = alreadDeployed.get(facetNameStr);
      if (existingAddress) {
        facet[0] = existingAddress;
        continue;
      }
      console.log(`Deploying ${facetNameStr}`);
      const facetFactoryOrContract = facetFactories.get(facetNameStr);
      if (!facetFactoryOrContract) {
        throw new Error(`Facet factory/contract not found for ${facetNameStr}`);
      }
      let deployedFacet!: Contract;
      let receipt: providers.TransactionReceipt;
      if (!(facetFactoryOrContract instanceof ethers.Contract)) {
        let factory = facetFactoryOrContract as ContractFactory;
        deployedFacet = await factory.deploy();
        receipt = await deployedFacet.deployTransaction.wait();
        if (receipt.status !== 1)
          throw new Error(
            `Deploying facet ${facetNameStr} in upgrade failed. Tx: ${receipt.transactionHash}`
          );
      } else {
        deployedFacet = facetFactoryOrContract as Contract;
      }
      console.log(`${facetNameStr} deployed: ${deployedFacet.address}`);
      alreadDeployed.set(facetNameStr, deployedFacet.address);
      facet[0] = deployedFacet.address;
    }
  }

  console.log("diamondCut arg:");
  console.log(diamondCut);

  let initFacetAddress = ethers.constants.AddressZero;
  let functionCall = "0x";
  if (initFacetName !== undefined) {
    let initFacet = facetFactories.get(initFacetName) as
      | Contract
      | ContractFactory
      | undefined;
    if (!initFacet || !(initFacet instanceof ethers.Contract)) {
      const InitFacetFactory = await ethers.getContractFactory(
        initFacetName,
        signer
      );
      const deployedInitFacet = await InitFacetFactory.deploy();
      const initReceipt = await deployedInitFacet.deployTransaction.wait();
      if (initReceipt.status !== 1)
        throw new Error(
          `Deploying init facet ${initFacetName} in upgrade failed. Tx: ${initReceipt.transactionHash}`
        );
      console.log("Deployed init facet: " + deployedInitFacet.address);
      initFacet = deployedInitFacet;
    } else {
      console.log("Using init facet: " + (initFacet as Contract).address);
    }
    functionCall = (initFacet as Contract).interface.encodeFunctionData(
      "init",
      initArgs
    );
    console.log("Function call: ");
    console.log(functionCall);
    initFacetAddress = (initFacet as Contract).address;
  }

  const txResult = await diamondCutFacet.diamondCut(
    diamondCut,
    initFacetAddress,
    functionCall,
    txArgs
  );
  const txReceipt = await txResult.wait();
  if (txReceipt.status !== 1) {
    throw new Error(
      `Diamond cut in upgrade failed. Receipt: ${JSON.stringify(txReceipt)}`
    );
  }

  console.log("------");
  console.log("Upgrade transaction hash: " + txResult.hash);
  return { txResult, txReceipt }; // Return receipt
}

export async function upgradeWithNewFacets({
  diamondAddress,
  facetNames,
  signer,
  selectorsToRemove = [],
  initFacetName = undefined,
  initArgs = [],
}: {
  diamondAddress: string;
  facetNames: any[];
  signer: Signer;
  selectorsToRemove?: string[];
  initFacetName?: string;
  initArgs?: any[];
}) {
  if (arguments.length === 1) {
    throw Error(`Function expects a single object argument.`);
  }
  const diamondCutFacet = (
    await ethers.getContractAt("DiamondCutFacet", diamondAddress)
  ).connect(signer);
  const diamondLoupeFacet = (
    await ethers.getContractAt("DiamondLoupeFacet", diamondAddress)
  ).connect(signer); // For consistency

  const diamondCut: DiamondCutStruct[] = [];
  const existingFacets = await diamondLoupeFacet.facets(); // view call
  const undeployed: Array<[string, ContractFactory]> = [];
  const deployed: Array<[string, Contract]> = [];

  for (const name of facetNames) {
    const facetFactory = await ethers.getContractFactory(
      name as string,
      signer
    );
    undeployed.push([name as string, facetFactory]);
  }

  if (selectorsToRemove.length > 0) {
    for (const selector of selectorsToRemove) {
      if (!inFacets(selector, existingFacets)) {
        throw Error("Function selector to remove is already gone.");
      }
    }
    diamondCut.push({
      facetAddress: ethers.constants.AddressZero,
      action: FacetCutAction.Remove,
      functionSelectors: selectorsToRemove,
    });
  }

  const deployedFacetReceipts: providers.TransactionReceipt[] = [];

  for (const [name, facetFactory] of undeployed) {
    console.log(`Deploying ${name}`);
    const deployedFactoryInstance = await facetFactory.deploy();
    const receipt = await deployedFactoryInstance.deployTransaction.wait();
    if (receipt.status !== 1)
      throw new Error(
        `Deploying facet ${name} in upgradeWithNewFacets failed. Tx: ${receipt.transactionHash}`
      );
    deployed.push([name, deployedFactoryInstance]);
    deployedFacetReceipts.push(receipt);
  }

  for (const [name, deployedFactory] of deployed) {
    console.log("--");
    console.log(`${name} deployed: ${deployedFactory.address}`);
    const add: string[] = [];
    const replace: string[] = [];
    for (const selector of getSelectors(deployedFactory)) {
      if (!inFacets(selector, existingFacets)) {
        add.push(selector);
      } else {
        replace.push(selector);
      }
    }
    if (add.length > 0) {
      diamondCut.push({
        facetAddress: deployedFactory.address,
        action: FacetCutAction.Add,
        functionSelectors: add,
      });
    }
    if (replace.length > 0) {
      diamondCut.push({
        facetAddress: deployedFactory.address,
        action: FacetCutAction.Replace,
        functionSelectors: replace,
      });
    }
  }
  console.log("diamondCut arg:");
  console.log(diamondCut);
  console.log("------");

  let initFacetAddress = ethers.constants.AddressZero;
  let functionCall = "0x";
  let initFacetDeployReceipt: providers.TransactionReceipt | undefined;

  if (initFacetName !== undefined) {
    let initFacet: Contract | undefined;
    for (const [name, deployedFactory] of deployed) {
      if (name === initFacetName) {
        initFacet = deployedFactory;
        break;
      }
    }
    if (!initFacet) {
      const InitFacetFactory = await ethers.getContractFactory(
        initFacetName,
        signer
      );
      const deployedInitFacet = await InitFacetFactory.deploy();
      initFacetDeployReceipt = await deployedInitFacet.deployTransaction.wait();
      if (initFacetDeployReceipt.status !== 1)
        throw new Error(
          `Deploying init facet ${initFacetName} in upgradeWithNewFacets failed. Tx: ${initFacetDeployReceipt.transactionHash}`
        );
      initFacet = deployedInitFacet;
      console.log("Deployed init facet: " + initFacet.address);
    } else {
      console.log("Using init facet: " + initFacet.address);
    }
    functionCall = initFacet.interface.encodeFunctionData("init", initArgs);
    console.log("Function call: ");
    console.log(functionCall);
    initFacetAddress = initFacet.address;
  }

  const txResult = await diamondCutFacet.diamondCut(
    diamondCut,
    initFacetAddress,
    functionCall
    // txArgs was missing here
  );
  const finalCutReceipt = await txResult.wait();
  if (finalCutReceipt.status !== 1) {
    throw new Error(
      `Diamond cut in upgradeWithNewFacets failed. Receipt: ${JSON.stringify(
        finalCutReceipt
      )}`
    );
  }

  console.log("------");
  console.log("Upgrade transaction hash: " + txResult.hash);
  return {
    txResult,
    finalCutReceipt,
    deployedFacetReceipts,
    initFacetDeployReceipt,
  }; // Return receipts
}
