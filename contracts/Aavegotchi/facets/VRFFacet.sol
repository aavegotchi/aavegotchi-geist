// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {Modifiers} from "../libraries/LibAppStorage.sol";
import {LibMeta} from "../../shared/libraries/LibMeta.sol";
import {LibERC721Marketplace} from "../libraries/LibERC721Marketplace.sol";
import {LibAavegotchi} from "../libraries/LibAavegotchi.sol";
// import {ILink} from "../interfaces/ILink.sol";

// import {RequestConfig} from "../libraries/LibAppStorage.sol";
//import {VRFCoordinatorV2Interface} from "../interfaces/VRFCoordinatorV2Interface.sol";
// // import {REQUEST_CONFIRMATIONS, NO_OF_WORDS, VRF_GAS_LIMIT} from "../libraries/LibAppStorage.sol";

import "../interfaces/IVRF.sol";

import {LibVrf} from "../libraries/LibVrf.sol";

contract VrfFacet is Modifiers {
    event VrfRandomNumber(uint256 indexed tokenId, uint256 randomNumber, uint256 _vrfTimeSet);
    event OpenPortals(uint256[] _tokenIds);
    event PortalOpened(uint256 indexed tokenId);

    /***********************************|
   |            Read Functions          |
   |__________________________________*/

    function vrfSystem() external view returns (address) {
        return s.VRFSystem;
    }

    /***********************************|
   |            Write Functions        |
   |__________________________________*/

    function openPortals(uint256[] calldata _tokenIds) external whenNotPaused {
        address owner = LibMeta.msgSender();
        for (uint256 i; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            require(s.aavegotchis[tokenId].status == LibAavegotchi.STATUS_CLOSED_PORTAL, "AavegotchiFacet: Portal is not closed");
            require(owner == s.aavegotchis[tokenId].owner, "AavegotchiFacet: Only aavegotchi owner can open a portal");
            require(s.aavegotchis[tokenId].locked == false, "AavegotchiFacet: Can't open portal when it is locked");
            drawRandomNumber(tokenId);
            LibERC721Marketplace.cancelERC721Listing(address(this), tokenId, owner);
        }
        emit OpenPortals(_tokenIds);
    }

    function drawRandomNumber(uint256 _tokenId) internal returns (uint256 requestId_) {
        s.aavegotchis[_tokenId].status = LibAavegotchi.STATUS_VRF_PENDING;

        requestId_ = IVRFSystem(s.VRFSystem).requestRandomNumberWithTraceId(_tokenId); //we use the tokenId as the traceId
        s.vrfRequestIdToTokenId[requestId_] = _tokenId;
        // for testing
        //  tempFulfillRandomness(requestId_, uint256(keccak256(abi.encodePacked(block.number, _tokenId))));
    }

    // for testing purpose only
    function tempFulfillRandomness(uint256 _requestId, uint256 _randomNumber) internal {
        // console.log("bytes");
        // console.logBytes32(_requestId);
        //_requestId; // mentioned here to remove unused variable warning

        uint256 tokenId = s.vrfRequestIdToTokenId[_requestId];

        // console.log("token id:", tokenId);

        // require(LibMeta.msgSender() == im_vrfCoordinator, "Only VRFCoordinator can fulfill");
        require(s.aavegotchis[tokenId].status == LibAavegotchi.STATUS_VRF_PENDING, "VrfFacet: VRF is not pending");
        s.aavegotchis[tokenId].status = LibAavegotchi.STATUS_OPEN_PORTAL;
        s.tokenIdToRandomNumber[tokenId] = _randomNumber;

        emit PortalOpened(tokenId);
        emit VrfRandomNumber(tokenId, _randomNumber, block.timestamp);
    }

    function randomNumberCallback(uint256 requestId, uint256 randomNumber) external whenNotPaused {
        require(LibMeta.msgSender() == s.VRFSystem, "Only VRFSystem can fulfill");
        uint256 tokenId = s.vrfRequestIdToTokenId[requestId];
        require(s.aavegotchis[tokenId].status == LibAavegotchi.STATUS_VRF_PENDING, "VrfFacet: VRF is not pending");
        s.aavegotchis[tokenId].status = LibAavegotchi.STATUS_OPEN_PORTAL;
        s.tokenIdToRandomNumber[tokenId] = randomNumber;
        emit PortalOpened(tokenId);
        emit VrfRandomNumber(tokenId, randomNumber, block.timestamp);
    }

    function setVRFSystem(address _vrfSystem) external onlyDaoOrOwner {
        s.VRFSystem = _vrfSystem;
    }

    //TESTING
    function getBaseRandomNumber(uint256 _tokenId) external view returns (uint256) {
        return s.tokenIdToRandomNumber[_tokenId];
    }
}
