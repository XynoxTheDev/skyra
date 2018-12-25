import { Client, Role, User } from 'discord.js';
import { CommandStore, KlasaMessage } from 'klasa';
import { SkyraGuildMember } from '../../lib/extensions/SkyraGuildMember';
import { ModerationCommand } from '../../lib/structures/ModerationCommand';
import { ModerationTypeKeys } from '../../lib/util/constants';
import { removeMute } from '../../lib/util/util';

export default class extends ModerationCommand {

	public constructor(client: Client, store: CommandStore, file: string[], directory: string) {
		super(client, store, file, directory, {
			description: (language) => language.get('COMMAND_UNMUTE_DESCRIPTION'),
			extendedHelp: (language) => language.get('COMMAND_UNMUTE_EXTENDED'),
			modType: ModerationTypeKeys.UnMute,
			permissionLevel: 5,
			requiredMember: true,
			requiredPermissions: ['MANAGE_ROLES']
		});
	}

	public async inhibit(message: KlasaMessage) {
		const id = message.guild.settings.get('roles.muted') as string;
		if (id && message.guild.roles.has(id)) return false;
		throw message.language.get('GUILD_SETTINGS_ROLES_MUTED');
	}

	public async prehandle() { /* Do nothing */ }

	public async handle(message: KlasaMessage, user: User, member: SkyraGuildMember, reason: string) {
		const modlog = (await message.guild.moderation.fetch(user.id)).filter((log) => log.type === ModerationTypeKeys.Mute).pop();
		if (!modlog) throw message.language.get('GUILD_MUTE_NOT_FOUND');
		await removeMute(member.guild, member.id);

		// Cache and concatenate with the current roles
		const { position } = message.guild.me.roles.highest;
		const roles = [...new Set((modlog.extraData || [])
			// Map by Role instances
			.map((id) => message.guild.roles.get(id))
			// Concatenate with the member's roles
			.concat(...member.roles.values()))]
			// Filter removed and unmanageable roles
			.filter((role: Role) => role && role.position < position && !role.managed)
			// Map by id
			.map((role: Role) => role.id);

		// Remove the muted role
		const muteIndex = roles.indexOf(message.guild.settings.get('roles.muted') as string);
		if (muteIndex !== -1) roles.splice(muteIndex, 1);

		// Edit roles
		await member.edit({ roles });
		return this.sendModlog(message, user, reason);
	}

	public async posthandle() { /* Do nothing */ }

}
