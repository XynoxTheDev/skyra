import { TriggerIncludes } from '@lib/database/entities/GuildEntity';
import { Events } from '@lib/types/Enums';
import { GuildSettings } from '@lib/types/namespaces/GuildSettings';
import { RESTJSONErrorCodes } from 'discord-api-types/v6';
import { KlasaMessage, Monitor } from 'klasa';

export default class extends Monitor {
	public async run(message: KlasaMessage): Promise<void> {
		const triggers = await message.guild!.readSettings(GuildSettings.Trigger.Includes);
		if (triggers.length <= 0) return;

		const content = message.content.toLowerCase();
		const trigger = triggers.find((trg) => content.includes(trg.input));
		if (trigger && trigger.action === 'react') {
			if (message.reactable) {
				await this.tryReact(message, trigger);
			}
		}
	}

	public shouldRun(message: KlasaMessage) {
		return (
			this.enabled &&
			message.guild !== null &&
			message.author !== null &&
			message.editedTimestamp === 0 &&
			message.content.length > 0 &&
			!message.system &&
			!message.author.bot
		);
	}

	private async tryReact(message: KlasaMessage, trigger: TriggerIncludes) {
		try {
			await message.react(trigger.output);
		} catch (error) {
			// Message has been deleted
			if (error.code === RESTJSONErrorCodes.UnknownMessage) return;
			// Attempted to react to a user who blocked the bot
			if (error.code === RESTJSONErrorCodes.ReactionWasBlocked) return;
			// The emoji has been deleted or the bot is not in the whitelist
			if (error.code === RESTJSONErrorCodes.UnknownEmoji) {
				await message.guild!.writeSettings((settings) => {
					const triggerIndex = settings[GuildSettings.Trigger.Includes].findIndex((element) => element === trigger);
					settings[GuildSettings.Trigger.Includes].splice(triggerIndex, 1);
				});
			} else {
				this.client.emit(Events.ApiError, error);
			}
		}
	}
}
