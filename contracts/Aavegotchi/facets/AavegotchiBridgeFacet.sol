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

    // Struct for Portal Options (potential Aavegotchis in a portal)
    struct PortalOption {
        uint8 portalOptionId; // The index of this option (0-9)
        uint256 randomNumber; // The random number associated with this option's stats
        int16[6] numericTraits; // The 6 numeric traits
        address collateralType; // The address of the collateral token
        uint256 minimumStake; // The minimum stake required in collateral (wei)
        uint16 baseRarityScore; // The base rarity score of this option
    }
    // Struct for the main Aavegotchi/Portal data entry from subgraph
    struct AavegotchiSubgraphPortalData {
        uint256 gotchiId; // The Aavegotchi's token ID (or portal ID if not claimed yet)
        address buyer; // Address of the buyer (address(0) if not applicable/null)
        uint256 hauntId; // The ID of the Haunt this portal/gotchi belongs to
        address owner; // Current owner of the portal/gotchi
        PortalOption[] options; // Array of up to 10 portal options
        string status; // Status like "Bought", "Claimed"
        uint256 boughtAtBlock; // Block number when bought (0 if not applicable/null)
        uint256 openedAtBlock; // Block number when portal opened (0 if not applicable/null)
        uint256 claimedAtBlock; // Block number when Aavegotchi claimed from portal (0 if not applicable/null)
        uint256 claimedTimestamp; // Timestamp when Aavegotchi claimed (0 if not applicable/null)
        uint256 timesTraded; // Number of times this Aavegotchi/portal has been traded
        uint256[] historicalPrices; // Array of historical sale prices in wei
        uint256 activeListingId; // ID of the active marketplace listing (0 if not listed/null)
    }

    struct AavegotchiHistoricalRecord {
        uint256 gotchiId; // The Aavegotchi's token ID
        string name; // The Aavegotchi's name
        uint256 createdAtBlock; // Block number when created/recorded
        uint256[] historicalPrices; // Array of historical sale prices in wei
        uint256 timesTraded; // Number of times this Aavegotchi has been traded
        uint256 activeListing; // ID of the active marketplace listing (0 if not listed/null)
    }

    // Event to emit processed subgraph data
    event PortalData(AavegotchiSubgraphPortalData data);

    // Event for processed historical Aavegotchi data
    event AavegotchiHistory(AavegotchiHistoricalRecord data);

    event ClaimedAt(uint256 _tokenId, uint256 _claimedAt);

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
                if (_mintItemsBridged[i].to.code.length > 0) {
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
                //hasn't been minted before
                uint256 tokenId = param.tokenIds[j];
                s.ownerTokenIdIndexes[param.owner][tokenId] = s.ownerTokenIds[param.owner].length;
                s.ownerTokenIds[param.owner].push(uint32(tokenId));
                s.aavegotchis[tokenId].owner = param.owner;
                //global storage
                s.tokenIds.push(uint32(tokenId));
                s.tokenIdIndexes[tokenId] = s.tokenIds.length;
                emit LibERC721.Transfer(address(0), param.owner, tokenId);
                s.tokenIdCounter++;
            }
        }
    }

    struct AavegotchiBridgedIO {
        uint16[EQUIPPED_WEARABLE_SLOTS] equippedWearables; //The currently equipped wearables of the Aavegotchi
        // [Experience, Rarity Score, Kinship, Eye Color, Eye Shape, Brain Size, Spookiness, Aggressiveness, Energy]
        int8[NUMERIC_TRAITS_NUM] temporaryTraitBoosts;
        int16[NUMERIC_TRAITS_NUM] numericTraits; // Sixteen 16 bit ints.  [Eye Color, Eye Shape, Brain Size, Spookiness, Aggressiveness, Energy]
        string name;
        uint256 randomNumber;
        uint256 experience; //How much XP this Aavegotchi has accrued. Begins at 0.
        uint256 minimumStake; //The minimum amount of collateral that must be staked. Set upon creation.
        uint256 usedSkillPoints; //The number of skill points this aavegotchi has already used
        uint256 interactionCount; //How many times the owner of this Aavegotchi has interacted with it.
        address collateralType;
        uint40 claimTime; //The block timestamp when this Aavegotchi was claimed
        uint40 lastTemporaryBoost;
        uint16 hauntId;
        address owner;
        uint8 status; // 0 == portal, 1 == VRF_PENDING, 2 == open portal, 3 == Aavegotchi
        uint40 lastInteracted; //The last time this Aavegotchi was interacted with
        bool locked;
        address escrow; //The escrow address this Aavegotchi manages.
        uint256 respecCount; //The number of times this Aavegotchi has been respec'd
        uint256 baseRandomNumber;
    }

    function setMetadata(uint256[] calldata _tokenIds, AavegotchiBridgedIO[] calldata _aavegotchis) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            _setMetadata(_tokenIds[i], _aavegotchis[i]);
        }
    }

    function setAavegotchi998Data(Aavegotchi998Data[] calldata _data) external onlyOwner {
        for (uint256 i = 0; i < _data.length; i++) {
            uint256 tokenId = _data[i].tokenId;
            address sender = LibMeta.msgSender();
            for (uint256 j = 0; j < _data[i].balances.length; j++) {
                LibItems.addToParent(address(this), tokenId, _data[i].balances[j].itemid, _data[i].balances[j].balance);
                emit LibERC1155.TransferToParent(address(this), tokenId, _data[i].balances[j].itemid, _data[i].balances[j].balance);
                //phantom event and writes for ERC1155
                //increase the total quantity of the item type
                s.itemTypes[_data[i].balances[j].itemid].totalQuantity += _data[i].balances[j].balance;
                IEventHandlerFacet(s.wearableDiamond).emitTransferSingleEvent(
                    sender,
                    address(0),
                    address(this),
                    _data[i].balances[j].itemid,
                    _data[i].balances[j].balance
                );
            }
        }
    }

    function _setMetadata(uint256 _tokenId, AavegotchiBridgedIO memory _aavegotchi) internal {
        //set it individually
        s.aavegotchis[_tokenId].equippedWearables = _aavegotchi.equippedWearables;
        s.aavegotchis[_tokenId].temporaryTraitBoosts = _aavegotchi.temporaryTraitBoosts;
        s.aavegotchis[_tokenId].numericTraits = _aavegotchi.numericTraits;
        s.aavegotchis[_tokenId].name = _aavegotchi.name;
        //account for portals that do not have any singluar random number yet
        s.aavegotchis[_tokenId].randomNumber = _aavegotchi.randomNumber;
        s.tokenIdToRandomNumber[_tokenId] = _aavegotchi.baseRandomNumber;
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
        s.aavegotchis[_tokenId].escrow = address(new CollateralEscrow(address(this), _tokenId));
        s.aavegotchis[_tokenId].respecCount = _aavegotchi.respecCount;
        //set in storage
        s.aavegotchiNamesUsed[LibAavegotchi.validateAndLowerNameBridge(_aavegotchi.name)] = true;
    }

    /**
     * @notice Processes an array of Aavegotchi subgraph data entries and emits an event for each.
     * @param _dataEntries An array of AavegotchiSubgraphData structs.
     */
    function processSubgraphData(AavegotchiSubgraphPortalData[] calldata _dataEntries) external onlyOwner {
        // Assuming onlyOwner or similar modifier
        for (uint i = 0; i < _dataEntries.length; i++) {
            AavegotchiSubgraphPortalData calldata entry = _dataEntries[i];

            emit PortalData(entry);
        }
    }

    /**
     * @notice Processes an array of Aavegotchi historical data records and emits an event for each.
     * @param _records An array of AavegotchiHistoricalRecord structs.
     */
    function processHistoricalAavegotchiData(AavegotchiHistoricalRecord[] calldata _records) external onlyOwner {
        // Or other appropriate access control
        for (uint i = 0; i < _records.length; i++) {
            AavegotchiHistoricalRecord calldata record = _records[i];
            emit AavegotchiHistory(record);
        }
    }

    event ResyncAavegotchis(uint256 _tokenId);
    function resyncAavegotchis(uint256[] calldata _tokenIds) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            emit ResyncAavegotchis(_tokenIds[i]);
        }
    }

    function emitClaimedEvent(uint256[] calldata _tokenIds, uint256[] calldata _claimedAtBlocks) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            emit ClaimedAt(_tokenIds[i], _claimedAtBlocks[i]);
        }
    }
}
