import type { VoiceConnection } from '@discordjs/voice';
import type {
  ChatInputCommandInteraction,
  ClientEvents,
  ContextMenuCommandBuilder,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Interaction,
  Message,
  NewsChannel,
  NonThreadGuildBasedChannel,
  PermissionsString,
  TextChannel,
  ThreadChannel,
  Typing,
  VoiceChannel,
} from 'discord.js';
import {
  ChannelType,
  Locale as DiscordLocales,
  MessagePayload,
  PermissionsBitField,
  Routes,
  SlashCommandBuilder,
  userMention,
} from 'discord.js';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { toLanguage } from '../utils';
import type { App } from './App';
import type { AssistantOptions, CreateSpeechOptions, InterpretedCommand, TranscribeOptions } from './Assistant';
import { Assistant } from './Assistant';
import type { Datastore } from './Datastore';
import type { EngineManager } from './EngineManager';
import { EventEmitter } from './EventEmitter';
import type { GuildAudioReceiver } from './GuildAudioReceiver';
import type { GuildVoiceChannel, JoinOptions } from './GuildVoiceChannel';
import type { Logger } from './Logger';
import type { AttachedCommand } from './PluginAdaptor';
import type { PluginContextOptions } from './PluginManager';

const LeastPermissions: PermissionsString[] = [
  'ViewChannel',
  'SendMessages',
  'EmbedLinks',
  'AddReactions',
  'ManageMessages',
  'ReadMessageHistory',
  'Connect',
  'Speak',
];

enum CommandResultEmoji {
  success = '✅',
  failure = '⚠️',
  forbidden = '🚫',
}

enum Status {
  unready,
  preparing,
  ready,
  destroying,
  destroyed,
}

export type GuildAssistantInterface = {
  beforeCommandsUpdate(commands: (SlashCommandBuilder | ContextMenuCommandBuilder)[]): Awaitable<void>;
  beforeJoin(options: JoinOptions, rejoin: boolean): Awaitable<void>;
  beforeSpeak(speech: PlayableSpeech<'guild'>): Awaitable<void>;
  beforeTranscribe(request: STTRequest<'guild'>, engine: ISpeechToText): Awaitable<void>;
  beforeDestroy(): Awaitable<void>;
  onReady(): Awaitable<void>;
  onJoin(channel: VoiceChannel, connection: VoiceConnection, rejoin: boolean): Awaitable<void>;
  onLeave(retry: boolean): Awaitable<void>;
  onListen(audio: RecognizableAudio<'guild'>): Awaitable<void>;
  onDictationCreate(dictation: GuildDictation): Awaitable<void>;
  onTranslationCreate(translation: GuildTranslation): Awaitable<void>;
  // Discord.js events
  onInteractionCreate(interaction: Interaction<'cached'>): Awaitable<void>;
  onMessageCreate(message: Message<true>, commanded: boolean): Awaitable<void>;
  onMessageDelete(...args: ClientEvents['messageDelete']): Awaitable<void>;
  onMessageDeleteBulk(...args: ClientEvents['messageDeleteBulk']): Awaitable<void>;
  onMessageUpdate(...args: ClientEvents['messageUpdate']): Awaitable<void>;
  onMessageReactionAdd(...args: ClientEvents['messageReactionAdd']): Awaitable<void>;
  onMessageReactionRemove(...args: ClientEvents['messageReactionRemove']): Awaitable<void>;
  onMessageReactionRemoveAll(...args: ClientEvents['messageReactionRemoveAll']): Awaitable<void>;
  onMessageReactionRemoveEmoji(...args: ClientEvents['messageReactionRemoveEmoji']): Awaitable<void>;
  onGuildCreate(...args: ClientEvents['guildCreate']): Awaitable<void>;
  onGuildDelete(...args: ClientEvents['guildDelete']): Awaitable<void>;
  onGuildUpdate(...args: ClientEvents['guildUpdate']): Awaitable<void>;
  onGuildUnavailable(...args: ClientEvents['guildUnavailable']): Awaitable<void>;
  onGuildIntegrationsUpdate(...args: ClientEvents['guildIntegrationsUpdate']): Awaitable<void>;
  onGuildMemberAdd(...args: ClientEvents['guildMemberAdd']): Awaitable<void>;
  onGuildMemberAvailable(...args: ClientEvents['guildMemberAvailable']): Awaitable<void>;
  onGuildMemberRemove(...args: ClientEvents['guildMemberRemove']): Awaitable<void>;
  onGuildMembersChunk(...args: ClientEvents['guildMembersChunk']): Awaitable<void>;
  onGuildMemberUpdate(...args: ClientEvents['guildMemberUpdate']): Awaitable<void>;
  onGuildBanAdd(...args: ClientEvents['guildBanAdd']): Awaitable<void>;
  onGuildBanRemove(...args: ClientEvents['guildBanRemove']): Awaitable<void>;
  onGuildScheduledEventCreate(...args: ClientEvents['guildScheduledEventCreate']): Awaitable<void>;
  onGuildScheduledEventDelete(...args: ClientEvents['guildScheduledEventDelete']): Awaitable<void>;
  onGuildScheduledEventUpdate(...args: ClientEvents['guildScheduledEventUpdate']): Awaitable<void>;
  onGuildScheduledEventUserAdd(...args: ClientEvents['guildScheduledEventUserAdd']): Awaitable<void>;
  onGuildScheduledEventUserRemove(...args: ClientEvents['guildScheduledEventUserRemove']): Awaitable<void>;
  onInviteCreate(...args: ClientEvents['inviteCreate']): Awaitable<void>;
  onInviteDelete(...args: ClientEvents['inviteDelete']): Awaitable<void>;
  onRoleCreate(...args: ClientEvents['roleCreate']): Awaitable<void>;
  onRoleDelete(...args: ClientEvents['roleDelete']): Awaitable<void>;
  onRoleUpdate(...args: ClientEvents['roleUpdate']): Awaitable<void>;
  onEmojiCreate(...args: ClientEvents['emojiCreate']): Awaitable<void>;
  onEmojiDelete(...args: ClientEvents['emojiDelete']): Awaitable<void>;
  onEmojiUpdate(...args: ClientEvents['emojiUpdate']): Awaitable<void>;
  onStickerCreate(...args: ClientEvents['stickerCreate']): Awaitable<void>;
  onStickerDelete(...args: ClientEvents['stickerDelete']): Awaitable<void>;
  onStickerUpdate(...args: ClientEvents['stickerUpdate']): Awaitable<void>;
  onChannelCreate(...args: ClientEvents['channelCreate']): Awaitable<void>;
  onChannelDelete(channel: NonThreadGuildBasedChannel): Awaitable<void>;
  onChannelUpdate(oldChannel: NonThreadGuildBasedChannel, newChannel: NonThreadGuildBasedChannel): Awaitable<void>;
  onChannelPinsUpdate(channel: GuildTextBasedChannel, date: Date): Awaitable<void>;
  onThreadCreate(...args: ClientEvents['threadCreate']): Awaitable<void>;
  onThreadDelete(...args: ClientEvents['threadDelete']): Awaitable<void>;
  onThreadListSync(...args: ClientEvents['threadListSync']): Awaitable<void>;
  onThreadMembersUpdate(...args: ClientEvents['threadMembersUpdate']): Awaitable<void>;
  onThreadMemberUpdate(...args: ClientEvents['threadMemberUpdate']): Awaitable<void>;
  onThreadUpdate(...args: ClientEvents['threadUpdate']): Awaitable<void>;
  onStageInstanceCreate(...args: ClientEvents['stageInstanceCreate']): Awaitable<void>;
  onStageInstanceDelete(...args: ClientEvents['stageInstanceDelete']): Awaitable<void>;
  onStageInstanceUpdate(...args: ClientEvents['stageInstanceUpdate']): Awaitable<void>;
  onWebhookUpdate(...args: ClientEvents['webhookUpdate']): Awaitable<void>;
  onApplicationCommandPermissionsUpdate(...args: ClientEvents['applicationCommandPermissionsUpdate']): Awaitable<void>;
  onPresenceUpdate(...args: ClientEvents['presenceUpdate']): Awaitable<void>;
  onVoiceStateUpdate(...args: ClientEvents['voiceStateUpdate']): Awaitable<void>;
  onTypingStart(
    typing: Typing & { channel: TextChannel | NewsChannel | ThreadChannel; get guild(): Guild },
  ): Awaitable<void>;
};

export type GuildAssistantOptions = {
  /**
   * Guild locale
   */
  locale: Locale;
  /**
   * Use slash commands
   * @default true
   */
  slash: boolean;
};

export class GuildAssistant extends Assistant<GuildAssistantInterface> {
  readonly self: GuildMember;
  readonly guild: Guild;
  readonly data: Datastore<'guild'>;
  readonly log: Logger;
  readonly engines: EngineManager;
  readonly audioPlayer: IAudioPlayer;
  readonly audioReceiver: GuildAudioReceiver;
  readonly options: GuildAssistantOptions;
  readonly requiredPermissions: Set<PermissionsString>;
  readonly #voiceChannel: GuildVoiceChannel;
  #status: Status;

  constructor(
    self: GuildMember,
    guild: Guild,
    options: GuildAssistantOptions,
    assistantOptions: AssistantOptions,
    di: {
      data: Datastore<'guild'>;
      log: Logger;
      engines: EngineManager;
      voiceChannel: GuildVoiceChannel;
      audioReceiver: GuildAudioReceiver;
    },
  ) {
    super(assistantOptions, di.log.error);
    this.self = self;
    this.guild = guild;
    this.data = di.data;
    this.log = di.log;
    this.engines = di.engines;
    this.audioPlayer = di.voiceChannel;
    this.audioReceiver = di.audioReceiver;
    this.options = options;
    this.requiredPermissions = new Set(LeastPermissions);
    this.#voiceChannel = di.voiceChannel;
    this.#status = Status.unready;
  }

  get locale(): Locale {
    return this.options.locale;
  }

  get voice(): JoinOptions | undefined {
    const joinConfig = this.#voiceChannel.joinConfig;
    if (!joinConfig?.channelId) return undefined;
    return joinConfig as JoinOptions;
  }

  async setup(app: App, optionsList: PluginContextOptions[]): Promise<void> {
    if (this.#status !== Status.unready) return;
    this.#status = Status.preparing;
    await this.data.setup(this.engines.getStore(), this.log.error);
    await app.hook('guildAssistantSetup', this, optionsList);
    this.log.debug?.('Data:', this.data);
    const attachReport = await this.attach(app.plugins, { type: 'guild', assistant: this, app, optionsList });
    this.log.debug?.('Attachments:', attachReport, this.attachments);
    this.initializeAssistant();
    this.#initializeEvents();
    if (this.options.slash) await this.#updateSlashCommands();
    this.log.info(`Ready: ${this.guild.id}`);
    this.#status = Status.ready;
    this.emit('ready');
    const missingPermissions = [...this.requiredPermissions].filter((p) => !this.self.permissions.has(p));
    if (missingPermissions.length === 0) return;
    this.log.warn(`Missing permission(s): ${missingPermissions.join(', ')}`);
  }

  async destroy(): Promise<void> {
    if (this.#status !== Status.ready) return;
    this.#status = Status.destroying;
    await this.hook('destroy').catch(this.log.error);
    await this.data.destroy().catch(this.log.error);
    this.#voiceChannel.destroy();
    this.log.info('Destroyed');
    this.#status = Status.destroyed;
  }

  #initializeEvents(): void {
    if (this.log.debug) {
      this.#voiceChannel.on('debug', this.log.debug);
      this.audioReceiver.on('debug', this.log.debug);
    }
    this.#voiceChannel.on('error', this.log.error);
    this.#voiceChannel.on('join', (connection, rejoin) => {
      const channelId = connection.joinConfig.channelId;
      if (!channelId) return;
      const channel = this.guild.channels.cache.get(channelId);
      if (!channel || channel.type !== ChannelType.GuildVoice) return;
      this.log.info(`${rejoin ? 'Rejoined' : 'Joined'}: ${channel.id}`);
      this.emit('join', channel, connection, rejoin);
      if (this.engines.maps.stt.size === 0) return;
      this.audioReceiver.subscribe(connection, channel);
    });
    this.#voiceChannel.on('leave', (retry) => {
      this.log.info('Left');
      this.emit('leave', retry);
    });
    this.audioReceiver.on('create', (audio) => {
      this.emit('listen', audio);
    });
  }

  async #updateSlashCommands(): Promise<void> {
    const discordLocales = Object.values(DiscordLocales);
    const slashCommands: SlashCommandBuilder[] = [];
    for (const command of this.commands.values()) {
      const i18n: Map<Locale, { description: string; options: Record<string, string> }> = new Map();
      for (const [locale, metadata] of Object.entries(command.plugin.i18n)) {
        const description = metadata.command?.[command.name]?.description;
        if (!description) continue;
        i18n.set(
          locale as Locale,
          typeof description === 'string'
            ? { description, options: {} }
            : { description: description[0], options: description[1] },
        );
      }
      for (const [locale, metadata] of i18n) {
        const lang = toLanguage(locale);
        if (i18n.has(lang)) continue;
        i18n.set(lang, metadata);
      }
      const main = i18n.get('en') ?? [...i18n.values()][0];
      if (!main) continue;
      const slashCommand = new SlashCommandBuilder().setName(command.id).setDescription(main.description || '-');
      const permissions = command.plugin.permissions[command.name];
      if (permissions && permissions.length > 0) {
        slashCommand.setDefaultMemberPermissions(new PermissionsBitField(permissions).bitfield);
      }
      for (const locale of discordLocales) {
        const sub = i18n.get(locale) ?? i18n.get(toLanguage(locale));
        if (!sub) continue;
        slashCommand.setDescriptionLocalization(locale, sub.description || '-');
      }
      for (const [name, description] of Object.entries(main.options)) {
        slashCommand.addStringOption((option) => {
          option
            .setName(name)
            .setDescription(description || '-')
            .setRequired(true);
          for (const locale of discordLocales) {
            const sub = i18n.get(locale) ?? i18n.get(toLanguage(locale));
            if (!sub) continue;
            option.setDescriptionLocalization(locale, sub.options[name] || '-');
          }
          return option;
        });
      }
      slashCommands.push(slashCommand);
    }
    await this.hook('commandsUpdate', slashCommands);
    this.log.debug?.('Slash commands:', slashCommands);
    const hash = createHash('md5')
      .update(JSON.stringify(slashCommands.map((c) => c.toJSON())))
      .digest('hex');
    if (this.data.get('slash') === hash) return;
    const response = await this.guild.client.rest.put(
      Routes.applicationGuildCommands(this.guild.client.application.id, this.guild.id),
      { body: slashCommands },
    );
    this.data.set('slash', hash);
    this.log.debug?.('Updated slash commands:', response);
  }

  run(
    options:
      | { type: 'interaction'; command: AttachedCommand; source: ChatInputCommandInteraction<'cached'> }
      | { type: 'message'; command: InterpretedCommand; source: Message<true> }
      | { type?: undefined; command: InterpretedCommand; source: RecognizableAudio },
  ): void {
    switch (options.type) {
      case 'interaction': {
        return this.#runCommandByInteraction(options.command, options.source);
      }
      case 'message': {
        return this.#runCommandByMessage(options.command, options.source);
      }
      default: {
        return this.#runCommandByAudio(options.command, options.source as RecognizableAudio<'guild'>);
      }
    }
  }

  #runCommandByInteraction(command: AttachedCommand, source: ChatInputCommandInteraction<'cached'>): void {
    if (!source.channel) return;
    const log = (result: string): string => `Slash command ${result}: ${source.user.id} -> /${command.id}`;
    const options = Object.fromEntries(source.options.data.map((option) => [option.name, `${option.value as string}`]));
    const event: CommandEvent<'guild'> = {
      type: 'slash',
      locale: source.locale,
      options,
      source,
      member: source.member,
      channel: source.channel,
      notified: false,
      notify: async (result = 'success') => {
        if (event.notified) return;
        event.notified = true;
        this.beep(result);
        const emoji = CommandResultEmoji[result];
        await (source.replied ? source.followUp(emoji) : source.reply(emoji));
      },
      reply: async (options, result = 'success') => {
        await event.notify(result);
        const payload = new MessagePayload(source, typeof options === 'string' ? { content: options } : options);
        return source.followUp(payload);
      },
    };
    // https://discord.com/developers/docs/interactions/receiving-and-responding
    // > you must send an initial response within 3 seconds of receiving the event.
    const timer = setTimeout(() => void source.reply('...').catch(this.log.error), 2500);
    (async () => {
      const result = (await command.execute(event)) === false ? 'failure' : 'success';
      clearTimeout(timer);
      event.notify(result).catch(this.log.error);
      this.log.info(log(result), options);
    })().catch((error) => {
      if (!source.replied) source.reply(CommandResultEmoji.failure).catch(this.log.error);
      this.beep('failure');
      this.log.error(log('error'), options, error);
    });
  }

  #runCommandByMessage(command: InterpretedCommand, source: Message<true>): void {
    const log = (result: string): string => `Text command ${result}: ${source.author.id} -> /${command.id}`;
    (async () => {
      const member = source.member ?? (await this.guild.members.fetch(source.author.id));
      if (!member.permissions.has(command.plugin.permissions[command.name] ?? [])) {
        source.react(CommandResultEmoji.forbidden).catch(this.log.error);
        this.beep('failure');
        this.log.warn(log('forbidden'), command.options);
        return;
      }
      const event: CommandEvent<'guild'> = {
        type: 'text',
        locale: command.locale,
        options: command.options,
        script: command.script,
        source,
        member,
        channel: source.channel,
        notified: false,
        notify: async (result = 'success') => {
          if (event.notified) return;
          event.notified = true;
          this.beep(result);
          await source.react(CommandResultEmoji[result]);
        },
        reply: async (options, result = 'success') => {
          await event.notify(result);
          return source.reply(options);
        },
      };
      const result = (await command.execute(event)) === false ? 'failure' : 'success';
      event.notify(result).catch(this.log.error);
      this.log.info(log(result), command.options);
    })().catch((error) => {
      source.react(CommandResultEmoji.failure).catch(this.log.error);
      this.beep('failure');
      this.log.error(log('error'), command.options, error);
    });
  }

  #runCommandByAudio(command: InterpretedCommand, source: RecognizableAudio<'guild'>): void {
    const log = (result: string): string => `Voice command ${result}: ${member.id} -> /${command.id}`;
    const member = source.member;
    if (!member.permissions.has(command.plugin.permissions[command.name] ?? [])) {
      this.beep('failure');
      this.log.warn(log('forbidden'), command.options);
      return;
    }
    let message: Message<true> | undefined;
    const notify = async (result: 'success' | 'failure'): Promise<Message<true>> => {
      if (message) return message;
      this.beep(result);
      const emoji = CommandResultEmoji[result];
      return (message = await source.destination.send(`${userMention(member.id)} \`/${command.id}\` ${emoji}`));
    };
    const event: CommandEvent<'guild'> = {
      type: 'voice',
      locale: command.locale,
      options: command.options,
      script: command.script,
      source,
      member,
      channel: source.channel,
      notified: false,
      notify: async (result = 'success') => {
        if (event.notified) return;
        event.notified = true;
        await notify(result);
      },
      reply: async (options, result = 'success') => {
        await event.notify(result);
        const message = await notify(result);
        return message.reply(options);
      },
    };
    (async () => {
      const result = (await command.execute(event)) === false ? 'failure' : 'success';
      event.notify(result).catch(this.log.error);
      this.log.info(log(result), command.options);
    })().catch((error) => {
      this.beep('failure');
      this.log.error(log('error'), command.options, error);
    });
  }

  async join(options: string | { channelId: string; selfDeaf?: boolean; selfMute?: boolean }): Promise<boolean> {
    if (typeof options === 'string') options = { channelId: options };
    const joinOptions = { selfDeaf: false, selfMute: false, ...options };
    await this.hook('join', joinOptions, false);
    return this.#voiceChannel.join(joinOptions);
  }

  async rejoin(options?: string | { channelId?: string; selfDeaf?: boolean; selfMute?: boolean }): Promise<boolean> {
    const current = this.voice;
    if (!current) return false;
    if (typeof options === 'string') options = { channelId: options };
    const joinOptions = { ...current, ...options };
    await this.hook('join', joinOptions, true);
    return this.#voiceChannel.rejoin(joinOptions);
  }

  leave(): boolean {
    return this.#voiceChannel.leave();
  }

  undeafen(): void {
    this.audioReceiver.enable();
  }

  deafen(): void {
    this.audioReceiver.disable();
  }

  transcribe(options: TranscribeOptions): boolean {
    const stt = this.engines.getSTT(options.engine);
    this.fallbackVoice(stt, options);
    options.request.audio.prepare = async () => void (await this.hook('transcribe', options.request, stt));
    return stt.transcribe(options.request);
  }

  createSpeech(
    options: CreateSpeechOptions & { message?: PlayableSpeech<'guild'>['message'] },
  ): PlayableSpeech<'guild'> {
    const tts = this.engines.getTTS(options.engine);
    this.fallbackVoice(tts, options);
    const speech = new PlayableSpeechImpl(
      async (request) => {
        await this.hook('speak', speech);
        if (request.text.length === 0) return { ...request, resource: this.createEmptyAudioResource() };
        return tts.generate(request);
      },
      options.request,
      options.message,
      this.log.error,
    );
    return speech;
  }
}

class PlayableSpeechImpl
  extends EventEmitter<{ error: [error: unknown]; ready: [] }>
  implements PlayableSpeech<'guild'>
{
  readonly #generator: (request: TTSRequest) => Promise<TTSResponse>;
  readonly request: TTSRequest;
  response: TTSResponse | undefined;
  readonly message?: PlayableSpeech<'guild'>['message'];

  constructor(
    generator: (request: TTSRequest) => Promise<TTSResponse>,
    request: TTSRequest,
    message: PlayableSpeech<'guild'>['message'] | undefined,
    errorHandler: ErrorHandler,
  ) {
    super(errorHandler);
    this.#generator = generator;
    this.request = request;
    if (message) this.message = message;
  }

  get resource(): Readable | undefined {
    return this.response?.resource;
  }

  async generate(): Promise<void> {
    if (this.response) return;
    try {
      this.response = await this.#generator(this.request);
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
    }
  }
}
