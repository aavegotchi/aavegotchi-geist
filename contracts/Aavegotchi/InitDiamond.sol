// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {AppStorage} from "./libraries/LibAppStorage.sol";
import {LibMeta} from "../shared/libraries/LibMeta.sol";
import {LibDiamond} from "../shared/libraries/LibDiamond.sol";
import {IDiamondCut} from "../shared/interfaces/IDiamondCut.sol";
import {IERC165} from "../shared/interfaces/IERC165.sol";
import {IERC721} from "../shared/interfaces/IERC721.sol";
import {IDiamondLoupe} from "../shared/interfaces/IDiamondLoupe.sol";
import {IERC173} from "../shared/interfaces/IERC173.sol";

import "./libraries/LibAppStorage.sol";

contract InitDiamond {
    AppStorage internal s;

    struct Args {
        address dao;
        address daoTreasury;
        address pixelCraft;
        address rarityFarming;
        //name and symbol are now constants
        // string name;
        // string symbol;
        address ghstContract;
        address vrfSystem;
        address relayerPetter;
    }
    function init(Args memory _args) external {
        s.dao = _args.dao;
        s.daoTreasury = _args.daoTreasury;
        s.rarityFarming = _args.rarityFarming;
        s.pixelCraft = _args.pixelCraft;
        s.itemsBaseUri = "https://app.aavegotchi.com/metadata/items/";

        s.domainSeparator = LibMeta.domainSeparator("AavegotchiDiamond", "V1");
        s.VRFSystem = _args.vrfSystem;

        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

        // adding ERC165 data
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;
        ds.supportedInterfaces[(type(IERC721).interfaceId)] = true;
        s.ghstContract = _args.ghstContract;
        s.listingFeeInWei = 1e17;
        s.tokenIdCounter = 25_000;
        s.relayerPetter = _args.relayerPetter;
    }
}
