import { DiscordEvents } from '@lib/types/Events';
import { GatewayGuildCreateDispatch } from 'discord-api-types/v6';
import { Event, EventStore } from 'klasa';

export default class extends Event {
	public constructor(store: EventStore, file: string[], directory: string) {
		super(store, file, directory, { name: DiscordEvents.GuildCreate, emitter: store.client.ws });
	}

	public run(data: GatewayGuildCreateDispatch['d']) {
		return Promise.all(data.voice_states!.map((state) => this.client.audio.voiceStateUpdate({ ...state, guild_id: data.id })));
	}
}
