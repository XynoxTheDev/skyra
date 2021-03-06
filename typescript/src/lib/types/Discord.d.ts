import type { GuildBasedChannelTypes } from '#utils/functions';
import type { DMChannel, Guild, GuildMember, Message, NewsChannel, TextChannel } from 'discord.js';

export interface GuildMessage extends Message {
	channel: GuildBasedChannelTypes;
	readonly guild: Guild;
	readonly member: GuildMember;
}

export interface DMMessage extends Message {
	channel: DMChannel;
	readonly guild: null;
	readonly member: null;
}

export type MessageAcknowledgeable = TextChannel | GuildMessage;
