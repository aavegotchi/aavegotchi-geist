// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import "../libraries/LibAppStorage.sol";

contract ForgeWriteFacet is Modifiers {
    event SetMultiTierGeodePrizes(uint256[] ids, uint256[] quantities, uint8[] rarities);
    event SetSmeltingSkillPointReductionFactorBips(uint256 oldBips, uint256 newBips);
    event SetSkillPointsEarnedFromForge(RarityValueIO newPoints);
    event SetGeodeWinChance(MultiTierGeodeChanceIO newChances);
    event SetForgeAlloyCost(RarityValueIO newCosts);
    event SetForgeEssenceCost(RarityValueIO newCosts);
    event SetForgeTimeCostInBlocks(RarityValueIO newCosts);

    function getRarityScoreModifiers() private pure returns (uint8[6] memory) {
        return [uint8(COMMON_RSM), UNCOMMON_RSM, RARE_RSM, LEGENDARY_RSM, MYTHICAL_RSM, GODLIKE_RSM];
    }

    function setForgeAlloyCosts(uint256[] calldata _alloyCosts) external onlyDaoOrOwner {
        require(_alloyCosts.length == 6, "ForgeWriteFacet: Invalid array length");
        uint8[6] memory rarityScoreModifiers = getRarityScoreModifiers();

        for (uint8 i; i < 6; i++) {
            s.forgeAlloyCost[rarityScoreModifiers[i]] = _alloyCosts[i];
        }
        RarityValueIO memory costs = RarityValueIO({
            common: _alloyCosts[0],
            uncommon: _alloyCosts[1],
            rare: _alloyCosts[2],
            legendary: _alloyCosts[3],
            mythical: _alloyCosts[4],
            godlike: _alloyCosts[5]
        });
        emit SetForgeAlloyCost(costs);
    }

    function setForgeEssenceCosts(uint256[] calldata _essenceCosts) external onlyDaoOrOwner {
        require(_essenceCosts.length == 6, "ForgeWriteFacet: Invalid array length");
        uint8[6] memory rarityScoreModifiers = getRarityScoreModifiers();

        for (uint8 i; i < 6; i++) {
            s.forgeEssenceCost[rarityScoreModifiers[i]] = _essenceCosts[i];
        }
        RarityValueIO memory costs = RarityValueIO({
            common: _essenceCosts[0],
            uncommon: _essenceCosts[1],
            rare: _essenceCosts[2],
            legendary: _essenceCosts[3],
            mythical: _essenceCosts[4],
            godlike: _essenceCosts[5]
        });
        emit SetForgeEssenceCost(costs);
    }

    function setForgeTimeCostsInBlocks(uint256[] calldata _timeCosts) external onlyDaoOrOwner {
        require(_timeCosts.length == 6, "ForgeWriteFacet: Invalid array length");
        uint8[6] memory rarityScoreModifiers = getRarityScoreModifiers();

        for (uint8 i; i < 6; i++) {
            s.forgeTimeCostInBlocks[rarityScoreModifiers[i]] = _timeCosts[i];
        }
        RarityValueIO memory costs = RarityValueIO({
            common: _timeCosts[0],
            uncommon: _timeCosts[1],
            rare: _timeCosts[2],
            legendary: _timeCosts[3],
            mythical: _timeCosts[4],
            godlike: _timeCosts[5]
        });
        emit SetForgeTimeCostInBlocks(costs);
    }

    function setForgeSkillPointsEarned(uint256[] calldata _skillPoints) external onlyDaoOrOwner {
        require(_skillPoints.length == 6, "ForgeWriteFacet: Invalid array length");
        uint8[6] memory rarityScoreModifiers = getRarityScoreModifiers();

        for (uint8 i; i < 6; i++) {
            s.skillPointsEarnedFromForge[rarityScoreModifiers[i]] = _skillPoints[i];
        }
        RarityValueIO memory costs = RarityValueIO({
            common: _skillPoints[0],
            uncommon: _skillPoints[1],
            rare: _skillPoints[2],
            legendary: _skillPoints[3],
            mythical: _skillPoints[4],
            godlike: _skillPoints[5]
        });
        emit SetSkillPointsEarnedFromForge(costs);
    }

    function setSmeltingSkillPointReductionFactorBipsBridged(uint256 _reductionFactor) external onlyDaoOrOwner {
        require(_reductionFactor <= 10000, "ForgeWriteFacet: Reduction factor cannot exceed 10000");
        s.smeltingSkillPointReductionFactorBips = _reductionFactor;
        emit SetSmeltingSkillPointReductionFactorBips(0, _reductionFactor);
    }

    function setGeodeWinChanceMultiTierBips(
        uint8[] calldata _geodeRarities,
        uint8[] calldata _prizeRarities,
        uint256[] calldata _winChances
    ) external onlyDaoOrOwner {
        require(
            _geodeRarities.length == _prizeRarities.length && _prizeRarities.length == _winChances.length,
            "ForgeWriteFacet: Array lengths must match"
        );

        for (uint256 i; i < _geodeRarities.length; i++) {
            s.geodeWinChanceMultiTierBips[_geodeRarities[i]][_prizeRarities[i]] = _winChances[i];
        }

        RarityValueIO[] memory chances = new RarityValueIO[](_geodeRarities.length);

        for (uint256 i; i < _geodeRarities.length; i++) {
            chances[i] = RarityValueIO({
                common: _winChances[i],
                uncommon: _winChances[i],
                rare: _winChances[i],
                legendary: _winChances[i],
                mythical: _winChances[i],
                godlike: _winChances[i]
            });
        }

        MultiTierGeodeChanceIO memory m = MultiTierGeodeChanceIO({
            common: chances[0],
            uncommon: chances[1],
            rare: chances[2],
            legendary: chances[3],
            mythical: chances[4],
            godlike: chances[5]
        });

        emit SetGeodeWinChance(m);
    }

    function syncWearablePrizes(uint256[] calldata _tokenIds) external onlyDaoOrOwner {
        for (uint256 i; i < _tokenIds.length; i++) {
            s.geodePrizeTokenIds.push(_tokenIds[i]);
        }
    }

    function setGeodePrizes(uint256[] calldata _tokenIds, uint256[] calldata _quantities, uint8[] calldata _rarities) external onlyDaoOrOwner {
        require(_tokenIds.length == _quantities.length && _quantities.length == _rarities.length, "ForgeWriteFacet: Array lengths must match");

        for (uint256 i; i < _tokenIds.length; i++) {
            s.geodePrizeTokenIds.push(_tokenIds[i]);
            s.geodePrizeRarities[_tokenIds[i]] = _rarities[i];
            s.geodePrizeQuantities[_tokenIds[i]] = _quantities[i];
        }

        emit SetMultiTierGeodePrizes(_tokenIds, _quantities, _rarities);
    }

    function batchSetGotchiSmithingSkillPoints(uint256[] calldata _tokenIds, uint256[] calldata _skillPoints) external onlyDaoOrOwner {
        require(_tokenIds.length == _skillPoints.length, "ForgeWriteFacet: Array lengths must match");

        for (uint256 i; i < _tokenIds.length; i++) {
            s.gotchiSmithingSkillPoints[_tokenIds[i]] = _skillPoints[i];
        }
    }
}
