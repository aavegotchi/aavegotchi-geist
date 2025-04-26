// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import "../libraries/LibAppStorage.sol";
import "../libraries/LibItems.sol";
import "../libraries/LibAavegotchi.sol";
import {LibMeta} from "../../shared/libraries/LibMeta.sol";
import {LibERC1155} from "../../shared/libraries/LibERC1155.sol";
import "../WearableDiamond/interfaces/IEventHandlerFacet.sol";
import "../CollateralEscrow.sol";

contract AavegotchiBridgeFacet is Modifiers {
    struct MintItemsBridged {
        address to;
        ItemBalance[] itemBalances;
    }

    struct ItemBalance {
        uint256 itemId;
        uint256 quantity;
    }

    function batchMintItems(MintItemsBridged[] calldata _mintItemsBridged) external onlyItemManager {
        for (uint256 i; i < _mintItemsBridged.length; i++) {
            address sender = LibMeta.msgSender();
            uint256 itemTypesLength = s.itemTypes.length;
            for (uint256 j; j < _mintItemsBridged[i].itemBalances.length; j++) {
                uint256 itemId = _mintItemsBridged[i].itemBalances[j].itemId;

                require(itemTypesLength > itemId, "DAOFacet: Item type does not exist");

                uint256 quantity = _mintItemsBridged[i].itemBalances[j].quantity;
                uint256 totalQuantity = s.itemTypes[itemId].totalQuantity + quantity;
                require(totalQuantity <= s.itemTypes[itemId].maxQuantity, "DAOFacet: Total item type quantity exceeds max quantity");

                LibItems.addToOwner(_mintItemsBridged[i].to, itemId, quantity);
                s.itemTypes[itemId].totalQuantity = totalQuantity;

                IEventHandlerFacet(s.wearableDiamond).emitTransferSingleEvent(
                    sender,
                    address(0),
                    _mintItemsBridged[i].to,
                    _mintItemsBridged[i].itemBalances[j].itemId,
                    _mintItemsBridged[i].itemBalances[j].quantity
                );
                LibERC1155.onERC1155Received(
                    sender,
                    address(0),
                    _mintItemsBridged[i].to,
                    _mintItemsBridged[i].itemBalances[j].itemId,
                    _mintItemsBridged[i].itemBalances[j].quantity,
                    ""
                );
            }
        }
    }

    struct MintAavegotchiParams {
        address owner;
        uint256[] tokenIds;
    }

    struct Aavegotchi998Data {
        uint256 tokenId;
        AavegotchiItembalance[] balances;
    }

    struct AavegotchiItembalance {
        uint256 itemid;
        uint256 balance;
    }

    function mintAavegotchiBridged(MintAavegotchiParams[] calldata _params) external onlyOwner {
        for (uint256 i = 0; i < _params.length; i++) {
            MintAavegotchiParams memory param = _params[i];
            for (uint256 j = 0; j < param.tokenIds.length; j++) {
                uint256 tokenId = param.tokenIds[j];
                s.ownerTokenIdIndexes[param.owner][tokenId] = s.ownerTokenIds[param.owner].length;
                s.ownerTokenIds[param.owner].push(uint32(tokenId));
                s.aavegotchis[tokenId].owner = param.owner;
                emit LibERC721.Transfer(address(0), param.owner, tokenId);
            }
        }
    }

    function setMetadata(uint256[] calldata _tokenIds, Aavegotchi[] calldata _aavegotchis) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            _setMetadata(_tokenIds[i], _aavegotchis[i]);
        }
    }

    function setAavegotchi998Data(Aavegotchi998Data[] calldata _data) external onlyOwner {
        for (uint256 i = 0; i < _data.length; i++) {
            uint256 tokenId = _data[i].tokenId;
            for (uint256 j = 0; j < _data[i].balances.length; j++) {
                LibItems.addToParent(address(this), tokenId, _data[i].balances[j].itemid, _data[i].balances[j].balance);
                emit LibERC1155.TransferToParent(address(this), tokenId, _data[i].balances[j].itemid, _data[i].balances[j].balance);
            }
        }
    }

    function _setMetadata(uint256 _tokenId, Aavegotchi memory _aavegotchi) internal {
        //set it individually
        s.aavegotchis[_tokenId].equippedWearables = _aavegotchi.equippedWearables;
        s.aavegotchis[_tokenId].temporaryTraitBoosts = _aavegotchi.temporaryTraitBoosts;
        s.aavegotchis[_tokenId].numericTraits = _aavegotchi.numericTraits;
        s.aavegotchis[_tokenId].name = _aavegotchi.name;
        s.aavegotchis[_tokenId].randomNumber = _aavegotchi.randomNumber;
        s.aavegotchis[_tokenId].experience = _aavegotchi.experience;
        s.aavegotchis[_tokenId].minimumStake = _aavegotchi.minimumStake;
        s.aavegotchis[_tokenId].usedSkillPoints = _aavegotchi.usedSkillPoints;
        s.aavegotchis[_tokenId].interactionCount = _aavegotchi.interactionCount;
        s.aavegotchis[_tokenId].collateralType = _aavegotchi.collateralType;
        s.aavegotchis[_tokenId].claimTime = _aavegotchi.claimTime;
        s.aavegotchis[_tokenId].lastTemporaryBoost = _aavegotchi.lastTemporaryBoost;
        s.aavegotchis[_tokenId].hauntId = _aavegotchi.hauntId;
        s.aavegotchis[_tokenId].owner = _aavegotchi.owner;
        s.aavegotchis[_tokenId].status = _aavegotchi.status;
        s.aavegotchis[_tokenId].lastInteracted = _aavegotchi.lastInteracted;
        s.aavegotchis[_tokenId].locked = _aavegotchi.locked;
        s.aavegotchis[_tokenId].escrow = address(new CollateralEscrow(_aavegotchi.collateralType, address(this), _tokenId));
        s.aavegotchis[_tokenId].respecCount = _aavegotchi.respecCount;
        //set in storage
        s.aavegotchiNamesUsed[LibAavegotchi.validateAndLowerName(_aavegotchi.name)] = true;
        //TO-DO whether to set onchain block-Age
    }
}
