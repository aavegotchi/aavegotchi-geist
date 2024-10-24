// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {AppStorage} from "./libraries/LibAppStorage.sol";
import {LibMeta} from "../shared/libraries/LibMeta.sol";
import {LibDiamond} from "../shared/libraries/LibDiamond.sol";
import {IDiamondCut} from "../shared/interfaces/IDiamondCut.sol";
import {IERC165} from "../shared/interfaces/IERC165.sol";
import {IDiamondLoupe} from "../shared/interfaces/IDiamondLoupe.sol";
import {IERC173} from "../shared/interfaces/IERC173.sol";
import {ILink} from "./interfaces/ILink.sol";

contract InitDiamond {
    AppStorage internal s;

    struct Args {
        address dao;
        address daoTreasury;
        address pixelCraft;
        address rarityFarming;
        bytes32 chainlinkKeyHash;
        uint64 subscriptionId;
        address vrfCoordinator;
        address childChainManager;
        string name;
        string symbol;
        address wghstContract;
    }

    function init(Args memory _args) external {
        s.dao = _args.dao;
        s.daoTreasury = _args.daoTreasury;
        s.rarityFarming = _args.rarityFarming;
        s.pixelCraft = _args.pixelCraft;
        s.itemsBaseUri = "https://aavegotchi.com/metadata/items/";
        s.childChainManager = _args.childChainManager;

        s.domainSeparator = LibMeta.domainSeparator("AavegotchiDiamond", "V1");

        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

        // adding ERC165 data
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;

        s.keyHash = _args.chainlinkKeyHash;
        s.subscriptionId = (_args.subscriptionId);
        s.vrfCoordinator = _args.vrfCoordinator;

        s.listingFeeInWei = 1e17;

        s.name = _args.name;
        s.symbol = _args.symbol;
        s.wghstContract = _args.wghstContract;
    }
}
