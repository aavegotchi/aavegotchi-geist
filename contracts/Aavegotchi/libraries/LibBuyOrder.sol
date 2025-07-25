// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import {LibAppStorage, AppStorage, ERC721BuyOrder, ERC1155BuyOrder} from "./LibAppStorage.sol";
import {LibAavegotchi} from "./LibAavegotchi.sol";
import {LibSharedMarketplace} from "./LibSharedMarketplace.sol";
import {IERC20} from "../../shared/interfaces/IERC20.sol";
import {LibERC20} from "../../shared/libraries/LibERC20.sol";

library LibBuyOrder {
    function cancelERC721BuyOrder(uint256 _buyOrderId) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();

        ERC721BuyOrder memory erc721BuyOrder = s.erc721BuyOrders[_buyOrderId];
        if (erc721BuyOrder.timeCreated == 0) {
            return;
        }
        if ((erc721BuyOrder.cancelled == true) || (erc721BuyOrder.timePurchased != 0)) {
            return;
        }

        removeERC721BuyOrder(_buyOrderId);
        s.erc721BuyOrders[_buyOrderId].cancelled = true;

        // refund GHST to buyer
        LibERC20.transfer(s.ghstContract, erc721BuyOrder.buyer, erc721BuyOrder.priceInWei);
    }

    function removeERC721BuyOrder(uint256 _buyOrderId) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();

        ERC721BuyOrder memory erc721BuyOrder = s.erc721BuyOrders[_buyOrderId];
        uint256 _tokenId = erc721BuyOrder.erc721TokenId;
        address _tokenAddress = erc721BuyOrder.erc721TokenAddress;

        delete s.buyerToBuyOrderId[_tokenAddress][_tokenId][erc721BuyOrder.buyer];
    }

    function generateValidationHash(
        address _erc721TokenAddress,
        uint256 _erc721TokenId,
        bool[] memory _validationOptions
    ) internal view returns (bytes32) {
        AppStorage storage s = LibAppStorage.diamondStorage();

        //Category is always validated
        uint256 category = LibSharedMarketplace.getERC721Category(_erc721TokenAddress, _erc721TokenId);
        bytes memory _params = abi.encode(_erc721TokenId, category);
        if (category == LibAavegotchi.STATUS_AAVEGOTCHI) {
            // Aavegotchi
            _params = abi.encode(_params, s.aavegotchis[_erc721TokenId].equippedWearables);
            if (_validationOptions[0]) {
                // BRS
                _params = abi.encode(_params, LibAavegotchi.baseRarityScore(s.aavegotchis[_erc721TokenId].numericTraits));
            }
            if (_validationOptions[1]) {
                // GHST
                _params = abi.encode(_params, IERC20(s.ghstContract).balanceOf(s.aavegotchis[_erc721TokenId].escrow));
            }
            if (_validationOptions[2]) {
                // skill points
                _params = abi.encode(_params, s.aavegotchis[_erc721TokenId].usedSkillPoints);
            }
        }
        return keccak256(_params);
    }

    function cancelERC1155BuyOrder(uint256 _buyOrderId) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();

        ERC1155BuyOrder memory erc1155BuyOrder = s.erc1155BuyOrders[_buyOrderId];
        if (erc1155BuyOrder.timeCreated == 0) {
            return;
        }
        if ((erc1155BuyOrder.cancelled == true) || (erc1155BuyOrder.completed == true)) {
            return;
        }

        s.erc1155BuyOrders[_buyOrderId].cancelled = true;

        // refund GHST to buyer
        LibERC20.transfer(s.ghstContract, erc1155BuyOrder.buyer, erc1155BuyOrder.priceInWei * erc1155BuyOrder.quantity);
    }
}
