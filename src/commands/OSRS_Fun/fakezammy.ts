import { createCanvas, Image, registerFont } from 'canvas';
import { MessageAttachment } from 'discord.js';
import { randInt } from 'e';
import fs from 'fs';
import { CommandStore, KlasaMessage } from 'klasa';

import { BotCommand } from '../../lib/BotCommand';

const bg = fs.readFileSync('./resources/images/tob-bg.png');
const canvas = createCanvas(399, 100);
const ctx = canvas.getContext('2d');

ctx.font = '16px OSRSFont';

registerFont('./resources/osrs-font.ttf', { family: 'Regular' });

const randomMessages = ['omfgggggg', '!#@$@#$@##@$', 'adfsjklfadkjsl;l', 'l00000l wtf'];

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			description: 'Fake yourself getting zammy loot!',
			cooldown: 3,
			requiredPermissions: ['ATTACH_FILES'],
			usage: '(username:string) [kc:int{1,999999}]',
			usageDelim: ','
		});
	}

	async run(msg: KlasaMessage, [username, kc = randInt(1, 150)]: [string, number]) {
		ctx.fillStyle = '#000000';
		const BG = new Image();
		BG.src = bg;
		ctx.drawImage(BG, 0, 0, BG.width, BG.height);

		ctx.fillText("Your K'ril Tsutsaroth kill count is: ", 11, 10);
		ctx.fillStyle = '#ff0000';
		ctx.fillText(
			kc.toString(),
			12 + ctx.measureText("Your K'ril Tsutsaroth kill count is: ").width,
			10
		);

		ctx.fillStyle = '#ff0000';
		ctx.fillText(`You have a funny feeling like you're being followed.`, 11, 25);

		ctx.fillStyle = '#005f00';
		ctx.fillText(`${username} received a drop: Pet k'ril tsutsaroth`, 11, 40);

		ctx.fillStyle = '#005f00';
		ctx.fillText(
			`${username} received a drop: ${
				Math.random() > 0.5 ? 'Zamorak hilt' : 'Staff of the dead'
			}`,
			11,
			54
		);

		/* Username */
		const randMessage = randomMessages[Math.floor(Math.random() * randomMessages.length)];
		ctx.fillStyle = '#000000';
		ctx.fillText(`${username}: `, 11, 69);
		ctx.fillStyle = '#0000ff';
		ctx.fillText(`${randMessage}*`, 12 + ctx.measureText(`${username}: `).width, 69);

		return msg.send(
			new MessageAttachment(canvas.toBuffer(), `${Math.round(Math.random() * 10000)}.jpg`)
		);
	}
}