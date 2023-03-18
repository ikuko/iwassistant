type AssistantType = 'guild' | 'home';

type PlayableAudio = {
  readonly resource: import('node:stream').Readable | undefined;
  generate(): Promise<void>;
} & import('../classes/EventEmitter').EventEmitter<{
  error: [error: unknown];
  ready: [];
  start: [];
  end: [];
}>;

type PlayableSpeech<T extends AssistantType = AssistantType> = PlayableAudio &
  (T extends 'guild'
    ? {
        readonly message?: {
          readonly source: import('discord.js').Message<true>;
          readonly member: import('discord.js').GuildMember;
          readonly content: string;
        };
      }
    : {}) & {
    readonly request: TTSRequest;
    readonly response: TTSResponse | undefined;
  };

type RecognizableAudio<T extends AssistantType = AssistantType> = (T extends 'guild'
  ? {
      readonly type: 'guild';
      readonly member: import('discord.js').GuildMember;
      readonly channel: import('discord.js').VoiceChannel;
      dist: import('discord.js').TextChannel | import('discord.js').VoiceChannel;
    }
  : { readonly type: 'home' }) & {
  readonly resource: import('node:stream').Readable;
  readonly results: string[];
  readonly transcript: string;
  readonly aborted: boolean;
  abort(): void;
} & import('../classes/EventEmitter').EventEmitter<{
    start: [request: STTRequest<T>];
    end: [request: STTRequest<T>];
    abort: [];
    result: [transcript: string, isFinal: boolean];
  }>;

type IAudioPlayer = {
  readonly active: boolean;
  play(audio: PlayableAudio): boolean;
  next(): boolean;
  stop(): boolean;
};

type CommandEvent<
  T extends AssistantType = AssistantType,
  U extends Record<string, string> = Record<string, string>,
> = {
  readonly locale: Locale;
  readonly options: U;
  notified: boolean;
  notify: (result?: 'success' | 'failure') => Promise<void>;
} & (T extends 'guild'
  ? (
      | {
          readonly type: 'slash';
          readonly source: import('discord.js').ChatInputCommandInteraction;
        }
      | {
          readonly type: 'text';
          readonly source: import('discord.js').Message<true>;
          readonly script: string;
        }
      | {
          readonly type: 'voice';
          readonly source: RecognizableAudio<'guild'>;
          readonly script: string;
        }
    ) & {
      readonly member: import('discord.js').GuildMember;
      readonly channel: import('discord.js').GuildTextBasedChannel;
      reply: (
        options: string | import('discord.js').MessageCreateOptions,
        result?: 'success' | 'failure',
      ) => Promise<import('discord.js').Message<true>>;
    }
  : {
      readonly type: 'home';
      readonly source: RecognizableAudio<'home'>;
    });

type GuildDictation = {
  request: STTRequest<'guild'>;
  source: RecognizableAudio<'guild'>;
  dist: import('discord.js').Message<true>;
  member: import('discord.js').GuildMember;
};

type GuildTranslation = {
  request: TranslatorRequest;
  response: TranslatorResponse;
  source: import('discord.js').Message<true>;
  dist: import('discord.js').Message<true>;
  member: import('discord.js').GuildMember;
};
