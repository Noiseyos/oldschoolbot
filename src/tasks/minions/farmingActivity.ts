import { Task } from 'klasa';
import { Monsters } from 'oldschooljs';

import { roll } from '../../lib/util';
import { Events, Emoji } from '../../lib/constants';
import { FarmingActivityTaskOptions } from '../../lib/types/minions';
import Farming from '../../lib/skilling/skills/farming/farming';
import { channelIsSendable } from '../../lib/util/channelIsSendable';
import { SkillsEnum } from '../../lib/skilling/types';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import createReadableItemListFromBank from '../../lib/util/createReadableItemListFromTuple';
import itemID from '../../lib/util/itemID';
import { rand } from 'oldschooljs/dist/util/util';
import { calcVariableYield } from '../../lib/skilling/functions/calcsFarming';
import bankHasItem from '../../lib/util/bankHasItem';
import guildmasterJaneImage from '../../lib/image/guildmasterJaneImage';

export default class extends Task {
	async run({
		plantsName,
		patchType,
		quantity,
		upgradeType,
		userID,
		channelID,
		msg,
		planting,
		duration
	}: FarmingActivityTaskOptions) {
		const user = await this.client.users.fetch(userID);
		const currentFarmingLevel = user.skillLevel(SkillsEnum.Farming);
		const currentWoodcuttingLevel = user.skillLevel(SkillsEnum.Woodcutting);
		let baseBonus = 1;
		let bonusXP;
		let plantXp = 0;
		let harvestXp = 0;
		let compostXp = 0;
		let checkHealthXp = 0;
		let rakeXp = 0;
		let woodcuttingXp = 0;
		let payStr = '';
		let wcStr = '';
		let rakeStr = '';
		let plantingStr = '';
		let alivePlants = 0;
		let chopped = false;
		let farmingXpReceived = 0;
		let chanceOfDeathReduction = 1;
		let cropYield: any;
		let lives = 3;

		const plant = Farming.Plants.find(plant => plant.name === plantsName);

		const hasMagicSecateurs = await msg.author.hasItem(itemID('Magic secateurs'), 1);
		if (hasMagicSecateurs) {
			baseBonus += 0.1;
		}
		const hasFarmingCape = await msg.author.hasItem(itemID('Farming cape'), 1);
		const hasFarmingCapeTrimmed = await msg.author.hasItem(itemID('Farming cape(t)'), 1);
		if (hasFarmingCape || hasFarmingCapeTrimmed) {
			baseBonus += 0.05;
		}

		if (upgradeType === 'compost') compostXp = 18;
		if (upgradeType === 'supercompost') compostXp = 26;
		if (upgradeType === 'ultracompost') compostXp = 36;

		// initial lives = 3. Compost, super, ultra, increases lives by 1 respectively and reduces chanceofdeath as well.
		// Payment = 0% chance of death
		if (patchType.LastUpgradeType === 'compost') {
			lives += 1;
			chanceOfDeathReduction = 1 / 2;
		} else if (patchType.LastUpgradeType === 'supercompost') {
			lives += 2;
			chanceOfDeathReduction = 1 / 5;
		} else if (patchType.LastUpgradeType === 'ultracompost') {
			lives += 3;
			chanceOfDeathReduction = 1 / 10;
		}

		if (patchType.LastPayment === true) chanceOfDeathReduction = 0;

		let loot = {
			[itemID('Weeds')]: 0
		};

		delete loot[itemID('Weeds')];

		if (patchType.IsHarvestable === false) {
			if (!plant) return;

			rakeXp = quantity * 4 * 3; // # of patches * exp per weed * # of weeds
			plantXp = quantity * (plant.plantXp + compostXp);
			farmingXpReceived = plantXp + harvestXp + rakeXp;
			bonusXP = 0;

			loot[itemID('Weeds')] = quantity * 3;

			let str = `${user}, ${
				user.minionName
			} finished raking ${quantity} patches and planting ${quantity}x ${
				plant.name
			}.\nYou received ${plantXp.toLocaleString()} XP from planting and ${rakeXp.toLocaleString()} XP from raking for a total of ${farmingXpReceived.toLocaleString()} Farming XP.`;

			if (bonusXP > 0) {
				str += ` You received an additional ${bonusXP.toLocaleString()} in bonus XP.`;
			}

			await user.addXP(SkillsEnum.Farming, Math.floor(farmingXpReceived + bonusXP));
			const newLevel = user.skillLevel(SkillsEnum.Farming);

			if (newLevel > currentFarmingLevel) {
				str += `\n\n${user.minionName}'s Farming level is now ${newLevel}!`;
			}

			if (Object.keys(loot).length > 0) {
				str += `\n\nYou received: ${await createReadableItemListFromBank(
					this.client,
					loot
				)}.`;
			}

			await user.addItemsToBank(loot, true);

			str += `\n\n${user.minionName} tells you to come back after your plants have finished growing!`;

			const channel = this.client.channels.get(channelID);
			if (!channelIsSendable(channel)) return;

			channel.send(str);
		} else if (patchType.IsHarvestable === true) {
			const plantToHarvest = Farming.Plants.find(
				plant => plant.name === patchType.LastPlanted
			);
			if (!plantToHarvest) return;

			let quantityDead = 0;
			for (let i = 0; i < patchType.LastQuantity; i++) {
				for (let j = 0; j < plantToHarvest.numOfStages - 1; j++) {
					const checkIfDied = Math.random();
					if (
						checkIfDied <
						Math.floor(plantToHarvest.chanceOfDeath * chanceOfDeathReduction) / 128
					) {
						quantityDead += 1;
						break;
					}
				}
			}

			alivePlants = patchType.LastQuantity - quantityDead;

			if (planting) {
				if (!plant) return;
				plantXp = quantity * (plant.plantXp + compostXp);
			}
			checkHealthXp = alivePlants * plantToHarvest.checkXp;

			if (plantToHarvest.givesCrops === true) {
				if (!plantToHarvest.outputCrop) return;
				if (plantToHarvest.variableYield) {
					cropYield = calcVariableYield(
						plantToHarvest,
						patchType.LastUpgradeType,
						currentFarmingLevel
					);
				} else if (plantToHarvest.fixedOutput === true) {
					if (!plantToHarvest.fixedOutputAmount) return;
					cropYield = plantToHarvest.fixedOutputAmount;
				} else {
					const plantChanceFactor =
						Math.floor(
							Math.floor(
								plantToHarvest.chance1 +
									(plantToHarvest.chance99 - plantToHarvest.chance1) *
										((user.skillLevel(SkillsEnum.Farming) - 1) / 98)
							) * baseBonus
						) + 1;
					const chanceToSaveLife = (plantChanceFactor + 1) / 256;
					if (plantToHarvest.seedType === 'bush') lives = 4;
					cropYield = 0;
					const livesHolder = lives;
					for (let k = 0; k < alivePlants; k++) {
						lives = livesHolder;
						for (let n = 0; lives > 0; n++) {
							if (Math.random() > chanceToSaveLife) {
								lives -= 1;
								cropYield += 1;
							} else {
								cropYield += 1;
							}
						}
					}
				}

				if (quantity > patchType.LastQuantity) {
					loot[plantToHarvest.outputCrop] = cropYield;
					loot[itemID('Weeds')] = quantity - patchType.LastQuantity;
				} else {
					loot[plantToHarvest.outputCrop] = cropYield;
				}

				if (plantToHarvest.name === 'Limpwurt') harvestXp = plantToHarvest.harvestXp;
				else harvestXp = cropYield * plantToHarvest.harvestXp;
			}

			if (plantToHarvest.needsChopForHarvest === true) {
				if (!plantToHarvest.treeWoodcuttingLevel) return;
				if (currentWoodcuttingLevel >= plantToHarvest.treeWoodcuttingLevel) chopped = true;
				else {
					await msg.author.settings.sync(true);
					const GP = msg.author.settings.get(UserSettings.GP);
					if (GP < 200 * alivePlants) {
						throw `You do not have the required woodcutting level or enough GP to clear your patches in order to be able to plant more.`;
					} else {
						payStr = `*You did not have the woodcutting level required, so you paid a nearby farmer 200 GP per patch to remove the previous tree.*`;
						await msg.author.removeGP(200 * alivePlants);
					}

					harvestXp = 0;
				}
				if (plantToHarvest.givesLogs === true && chopped === true) {
					if (!plantToHarvest.outputLogs) return;
					if (!plantToHarvest.woodcuttingXp) return;
					const amountOfLogs = rand(5, 10);
					loot[plantToHarvest.outputLogs] = amountOfLogs * alivePlants;

					woodcuttingXp += alivePlants * amountOfLogs * plantToHarvest.woodcuttingXp;
					wcStr = ` You also received ${woodcuttingXp.toLocaleString()} Woodcutting XP.`;

					harvestXp = 0;
				} else if (plantToHarvest.givesCrops === true && chopped === true) {
					if (!plantToHarvest.outputCrop) return;
					loot[plantToHarvest.outputCrop] = cropYield * alivePlants;

					harvestXp = cropYield * alivePlants * plantToHarvest.harvestXp;
				}
			}

			if (plantToHarvest.seedType === 'hespori') {
				await user.incrementMonsterScore(Monsters.Hespori.id);
				const hesporiLoot = Monsters.Hespori.kill();
				loot = hesporiLoot;
			}

			if (quantity > patchType.LastQuantity) {
				loot[6055] = (quantity - patchType.LastQuantity) * 3; // weeds
				rakeXp = (quantity - patchType.LastQuantity) * 3 * 4;
				rakeStr += ` ${rakeXp} XP for raking, `;
			}

			farmingXpReceived = plantXp + harvestXp + checkHealthXp + rakeXp;
			let deathStr = '';
			if (quantityDead > 0) {
				deathStr = ` During your harvest, you found that ${quantityDead}/${patchType.LastQuantity} of your plants died.`;
			}

			if (planting) {
				if (!plant) return;
				plantingStr = `${user}, ${user.minionName} finished planting ${quantity}x ${plant.name} and `;
			} else plantingStr = `${user}, ${user.minionName} finished `;

			let str = `${plantingStr}harvesting ${patchType.LastQuantity}x ${
				plantToHarvest.name
			}.${deathStr}${payStr}\n\nYou received ${plantXp.toLocaleString()} XP for planting, ${rakeStr}${harvestXp.toLocaleString()} XP for harvesting, and ${checkHealthXp.toLocaleString()} XP for checking health for a total of ${farmingXpReceived.toLocaleString()} Farming XP.${wcStr}\n`;

			// check bank for farmer's items
			const userBank = user.settings.get(UserSettings.Bank);
			let bonusXpMultiplier = 0;
			let farmersPiecesCheck = 0;
			if (bankHasItem(userBank, itemID(`Farmer's strawhat`), 1)) {
				bonusXpMultiplier += 0.004;
				farmersPiecesCheck += 1;
			}
			if (
				bankHasItem(userBank, itemID(`Farmer's jacket`), 1) ||
				bankHasItem(userBank, itemID(`Farmer's shirt`), 1)
			) {
				bonusXpMultiplier += 0.008;
				farmersPiecesCheck += 1;
			}
			if (bankHasItem(userBank, itemID(`Farmer's boro trousers`), 1)) {
				bonusXpMultiplier += 0.006;
				farmersPiecesCheck += 1;
			}
			if (bankHasItem(userBank, itemID(`Farmer's boots`), 1)) {
				bonusXpMultiplier += 0.002;
				farmersPiecesCheck += 1;
			}
			if (farmersPiecesCheck === 4) bonusXpMultiplier += 0.005;

			bonusXP = 0;
			bonusXP += Math.floor(farmingXpReceived * bonusXpMultiplier);

			if (bonusXP > 0) {
				str += `You received an additional ${bonusXP.toLocaleString()} bonus XP from your farmer's outfit.`;
			}

			await user.addXP(SkillsEnum.Farming, Math.floor(farmingXpReceived + bonusXP));
			await user.addXP(SkillsEnum.Woodcutting, Math.floor(woodcuttingXp));

			const newFarmingLevel = user.skillLevel(SkillsEnum.Farming);
			const newWoodcuttingLevel = user.skillLevel(SkillsEnum.Woodcutting);

			if (newFarmingLevel > currentFarmingLevel) {
				str += `\n\n${user.minionName}'s Farming level is now ${newFarmingLevel}!`;
			}

			if (newWoodcuttingLevel > currentWoodcuttingLevel) {
				str += `\n\n${user.minionName}'s Woodcutting level is now ${newWoodcuttingLevel}!`;
			}

			if (
				patchType.IsHarvestable &&
				plantToHarvest.petChance &&
				roll(
					(plantToHarvest.petChance - user.skillLevel(SkillsEnum.Farming) * 25) /
						alivePlants
				)
			) {
				loot[itemID('Tangleroot')] = 1;
				str += '\n```diff';
				str += `\n- You have a funny feeling you're being followed...`;
				str += '```';
				this.client.emit(
					Events.ServerNotification,
					`${Emoji.Farming} **${user.username}'s** minion, ${user.minionName}, just received a Tangleroot while farming ${patchType.LastPlanted} at level ${currentFarmingLevel} Farming!`
				);
			}

			const currentContract: any = msg.author.settings.get(
				UserSettings.FarmingContracts.FarmingContract
			);

			const contractsCompleted: number = currentContract.contractsCompleted;

			let janeMessage;
			if (plantToHarvest.name === currentContract.plantToGrow && alivePlants > 0) {
				const farmingContractUpdate = {
					contractStatus: 0,
					contractType: '',
					plantToGrow: '',
					seedPatchTier: currentContract.plantTier,
					plantTier: 0,
					contractsCompleted: contractsCompleted + 1
				};

				msg.author.settings.update(
					UserSettings.FarmingContracts.FarmingContract,
					farmingContractUpdate
				);
				loot[itemID('Seed pack')] = 1;

				janeMessage = true;
			}

			if (Object.keys(loot).length > 0) {
				str += `\nYou received: ${await createReadableItemListFromBank(
					this.client,
					loot
				)}.`;
			}

			str += `\n\n${user.minionName} tells you to come back after your plants have finished growing! `;

			await user.addItemsToBank(loot, true);

			const channel = this.client.channels.get(channelID);
			if (!channelIsSendable(channel)) return;

			msg.author.incrementMinionDailyDuration(duration);

			channel.send(str);
			if (janeMessage === true) {
				return msg.send(
					await guildmasterJaneImage(
						`You've completed your contract and I have rewarded you with 1 Seed pack. Please open this Seed pack before asking for a new contract!\nYou have completed ${contractsCompleted +
							1} farming contracts.`
					)
				);
			}
		}
	}
}
