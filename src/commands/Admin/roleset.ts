import { GuildSettings } from '@lib/database';
import { SkyraCommand, SkyraCommandOptions } from '@lib/structures/SkyraCommand';
import { GuildMessage } from '@lib/types';
import { PermissionLevels } from '@lib/types/Enums';
import { LanguageKeys } from '@lib/types/namespaces/LanguageKeys';
import { ApplyOptions, CreateResolvers } from '@skyra/decorators';
import { Role } from 'discord.js';

@ApplyOptions<SkyraCommandOptions>({
	aliases: ['rs'],
	description: (language) => language.get(LanguageKeys.Commands.Admin.RolesetDescription),
	extendedHelp: (language) => language.get(LanguageKeys.Commands.Admin.RolesetExtended),
	permissionLevel: PermissionLevels.Administrator,
	requiredPermissions: [],
	runIn: ['text'],
	subcommands: true,
	usage: '<add|remove|reset|list|auto:default> (name:name) (role:rolenames)',
	usageDelim: ' '
})
@CreateResolvers([
	[
		'name',
		(arg, possible, message, [subcommand]) => {
			if (subcommand === 'list') return undefined;
			if (!arg && subcommand === 'reset') return undefined;
			return message.client.arguments.get('string')!.run(arg, possible, message);
		}
	],
	[
		'rolenames',
		(arg, possible, message, [subcommand]) => {
			if (subcommand === 'list' || subcommand === 'reset') return undefined;
			return message.client.arguments.get('rolenames')!.run(arg, possible, message);
		}
	]
])
export default class extends SkyraCommand {
	// This subcommand will always ADD roles in to a existing set OR it will create a new set if that set does not exist
	public async add(message: GuildMessage, [name, roles]: [string, Role[]]) {
		// Get all rolesets from settings and check if there is an existing set with the name provided by the user
		const [created, roleSets, language] = await message.guild.writeSettings((settings) => {
			const allRoleSets = settings[GuildSettings.Roles.UniqueRoleSets];
			const roleSet = allRoleSets.find((set) => set.name === name);

			// If it does not exist we need to create a brand new set
			if (!roleSet) {
				allRoleSets.push({ name, roles: roles.map((role) => role.id) });
				return [true, allRoleSets, settings.getLanguage()];
			}

			// The set does exist so we want to only ADD new roles in
			// Create a new array that we can use to overwrite the existing one in settings
			settings[GuildSettings.Roles.UniqueRoleSets] = allRoleSets.map((set) => {
				if (set.name !== name) return set;
				const finalRoleIDs = [...set.roles];
				for (const role of roles) if (!finalRoleIDs.includes(role.id)) finalRoleIDs.push(role.id);

				return { name, roles: finalRoleIDs };
			});

			return [false, settings[GuildSettings.Roles.UniqueRoleSets], settings.getLanguage()];
		});

		return message.send(
			language.get(created ? LanguageKeys.Commands.Admin.RolesetCreated : LanguageKeys.Commands.Admin.RolesetAdded, {
				name,
				roles: language.list(
					roleSets.map((role) => role.name),
					language.get(LanguageKeys.Globals.And)
				)
			})
		);
	}

	// This subcommand will always remove roles from a provided role set.
	public async remove(message: GuildMessage, [name, roles]: [string, Role[]]) {
		// Get all rolesets from settings and check if there is an existing set with the name provided by the user
		const language = await message.guild.writeSettings((settings) => {
			// The set does exist so we want to only REMOVE provided roles from it
			// Create a new array that we can use to overwrite the existing one in settings
			settings[GuildSettings.Roles.UniqueRoleSets] = settings[GuildSettings.Roles.UniqueRoleSets].map((set) =>
				set.name === name ? { name, roles: set.roles.filter((id: string) => !roles.find((role) => role.id === id)) } : set
			);

			return settings.getLanguage();
		});

		return message.send(
			language.get(LanguageKeys.Commands.Admin.RolesetRemoved, {
				name,
				roles: language.list(
					roles.map((role) => role.name),
					language.get(LanguageKeys.Globals.And)
				)
			})
		);
	}

	public async reset(message: GuildMessage, [name]: [string?]) {
		// Get all rolesets from settings and check if there is an existing set with the name provided by the user
		const [allRolesets, language] = await message.guild.readSettings((settings) => [
			settings[GuildSettings.Roles.UniqueRoleSets],
			settings.getLanguage()
		]);
		if (allRolesets.length === 0) throw language.get(LanguageKeys.Commands.Admin.RolesetResetEmpty);

		if (!name) {
			await message.guild.writeSettings([[GuildSettings.Roles.UniqueRoleSets, []]]);
			return message.send(language.get(LanguageKeys.Commands.Admin.RolesetResetAll));
		}

		const arrayIndex = allRolesets.findIndex((roleset) => roleset.name === name);
		if (arrayIndex === -1) throw language.get(LanguageKeys.Commands.Admin.RolesetResetNotExists, { name });

		await message.guild.writeSettings((settings) => {
			settings[GuildSettings.Roles.UniqueRoleSets].splice(arrayIndex, 1);
		});

		return message.send(language.get(LanguageKeys.Commands.Admin.RolesetResetGroup, { name }));
	}

	// This subcommand will run if a user doesnt type add or remove. The bot will then add AND remove based on whether that role is in the set already.
	public async auto(message: GuildMessage, [name, roles]: [string, Role[]]) {
		// Get all rolesets from settings and check if there is an existing set with the name provided by the user
		const allRolesets = await message.guild.readSettings(GuildSettings.Roles.UniqueRoleSets);
		const roleset = allRolesets.find((set) => set.name === name);
		// If this roleset does not exist we have to create it
		if (!roleset) return this.add(message, [name, roles]);

		// The role set exists

		const newsets = allRolesets.map((set) => {
			if (set.name !== name) return set;
			// Add any role that wasnt in the set that the user provided
			// This will also remove any of the roles that user provided and were already in the set
			const newroles = set.roles
				.map((id) => (roles.find((role) => role.id === id) ? null : id)) //
				.filter((id) => id) as string[]; //

			for (const role of roles) if (!set.roles.includes(role.id)) newroles.push(role.id);

			return { name, roles: newroles };
		});

		await message.guild.writeSettings([[GuildSettings.Roles.UniqueRoleSets, newsets]]);
		return message.sendLocale(LanguageKeys.Commands.Admin.RolesetUpdated, [{ name }]);
	}

	// This subcommand will show the user a list of role sets and each role in that set.
	public async list(message: GuildMessage) {
		// Get all rolesets from settings
		const allRolesets = await message.guild.readSettings(GuildSettings.Roles.UniqueRoleSets);
		if (!allRolesets.length) return message.sendLocale(LanguageKeys.Commands.Admin.RolesetNoRolesets);
		const list = allRolesets.map((set) => `💠 **${set.name}**: ${set.roles.map((id) => message.guild.roles.cache.get(id)!.name).join(', ')}`);
		return message.send(list);
	}
}
