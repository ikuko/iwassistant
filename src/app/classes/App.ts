import type { ClientEvents, DMChannel, Interaction, Message, PartialDMChannel } from 'discord.js';
import { Client } from 'discord.js';
import { Datastore } from './Datastore';
import { DiscordManager } from './DiscordManager';
import { EngineManager } from './EngineManager';
import type { GuildAssistant } from './GuildAssistant';
import { GuildAssistantManager } from './GuildAssistantManager';
import { HomeAssistant } from './HomeAssistant';
import { Logger } from './Logger';
import { ModuleLoader } from './ModuleLoader';
import { PluginAdapter } from './PluginAdapter';
import type { PluginContextOptions } from './PluginManager';
import { PluginManager } from './PluginManager';

const HaltSignals: NodeJS.Signals[] = ['SIGHUP', 'SIGINT', 'SIGTERM'];

const EnginePaths = ['./app/builtin/engines/', './user/engines/'];

const PluginPaths = ['./app/builtin/plugins/', './user/plugins/'];

class EnvProxyHandler {
  readonly paths: Array<string>;

  constructor(paths: Array<string>) {
    this.paths = paths;
  }

  get(target: any, p: PropertyKey, receiver: any): any {
    const obj = target as Record<string, object>;
    const suffix = p as string;
    if (typeof obj[suffix] === 'function') {
      return obj[suffix];
    }
    if (typeof obj[suffix] === 'object') {
      return new Proxy(obj[suffix] as object, new EnvProxyHandler([...this.paths, suffix]));
    }
    if (obj[suffix] instanceof Proxy) {
      return obj[suffix];
    }
    const key = [...this.paths, suffix].join('_').replaceAll('-', '__').toUpperCase();
    if (process.env[key]) {
      return process.env[key];
    }
    if (obj[suffix]) {
      return obj[suffix];
    }
    if (Object.keys(process.env).some((x) => x.startsWith(key))) {
      const regExp = new RegExp(`^${key}_(.+)`);
      const keys = Object.keys(process.env)
        .map((x) => x.match(regExp)?.[1])
        .filter(Boolean)
        .map((x) => x?.replaceAll('__', '-'))
        .map((x) => x?.split('_')[0])
        .map((x) => x?.toLowerCase());
      if (keys.every((x) => x && /\d+/.test(x))) {
        return keys.map((x) => (x ? process.env[`${key}_${x}`] : undefined));
      } else {
        const entries = keys
          .filter((x): x is string => typeof x === 'string')
          .filter((x) => process.env[`${key}_${x.replaceAll('-', '__')}`])
          .map((x) => [process.env[`${key}_${x.replaceAll('-', '__')}`], {}]);
        return new Proxy(Object.fromEntries(entries), new EnvProxyHandler([...this.paths, suffix]));
      }
    }
    return undefined;
  }

  ownKeys(target: any): any {
    const obj = target as Record<string, object>;
    const prefix = [...this.paths].join('_').toUpperCase();
    const regExp = new RegExp(`^${prefix}_(.+)`);
    const keys = Object.keys(process.env)
      .map((x) => x.match(regExp)?.[1])
      .filter(Boolean)
      .map((x) => x?.replaceAll('__', '-'))
      .map((x) => x?.split('_')[0])
      .map((x) => x?.toLowerCase());
    return [...new Set([...Object.keys(obj), ...keys])];
  }

  getOwnPropertyDescriptor(target: any, p: PropertyKey): any {
    return {
      value: p,
      enumerable: true,
      configurable: true,
    };
  }
}

enum Status {
  unready,
  preparing,
  ready,
  destroying,
  destroyed,
}

type Argv = Record<string, string[]>;

type DI = {
  data: Datastore<'app'>;
  log: Logger;
  engines: EngineManager;
  plugins: PluginManager;
  discord: DiscordManager;
  home: HomeAssistant;
};

export type AppInterface = {
  beforeGuildAssistantSetup(assistant: GuildAssistant, optionsList: PluginContextOptions[]): Awaitable<void>;
  beforeDestroy(reason: string): Awaitable<void>;
  onReady(): Awaitable<void>;
  // Discord.js events
  onInteractionCreate(interaction: Interaction<undefined>): Awaitable<void>;
  onMessageCreate(message: Message<false>): Awaitable<void>;
  onMessageDelete(...args: ClientEvents['messageDelete']): Awaitable<void>;
  onMessageUpdate(...args: ClientEvents['messageUpdate']): Awaitable<void>;
  onMessageReactionAdd(...args: ClientEvents['messageReactionAdd']): Awaitable<void>;
  onMessageReactionRemove(...args: ClientEvents['messageReactionRemove']): Awaitable<void>;
  onMessageReactionRemoveAll(...args: ClientEvents['messageReactionRemoveAll']): Awaitable<void>;
  onMessageReactionRemoveEmoji(...args: ClientEvents['messageReactionRemoveEmoji']): Awaitable<void>;
  onChannelDelete(channel: DMChannel): Awaitable<void>;
  onChannelUpdate(oldChannel: DMChannel, newChannel: DMChannel): Awaitable<void>;
  onChannelPinsUpdate(channel: DMChannel | PartialDMChannel, date: Date): Awaitable<void>;
  onTypingStart(...args: ClientEvents['typingStart']): Awaitable<void>;
  onUserUpdate(...args: ClientEvents['userUpdate']): Awaitable<void>;
};

export class App extends PluginAdapter<AppInterface> {
  readonly locale: Locale;
  readonly data: Datastore<'app'>;
  readonly log: Logger;
  readonly engines: EngineManager;
  readonly plugins: PluginManager;
  readonly discord: DiscordManager;
  readonly home: HomeAssistant;
  readonly #log: Logger;
  #status: Status;

  constructor(locale: Locale, di: DI) {
    const log = di.log.createChild('APP');
    super(log.error);
    this.locale = locale;
    this.data = di.data;
    this.log = di.log;
    this.engines = di.engines;
    this.plugins = di.plugins;
    this.discord = di.discord;
    this.home = di.home;
    this.#log = log;
    this.#status = Status.unready;
  }

  get platform(): string {
    return process.platform;
  }

  async setup(): Promise<void> {
    if (this.#status !== Status.unready) return;
    this.#status = Status.preparing;
    this.#log.info('Launching iwassistant');
    this.#log.info(`Locale: ${this.locale}`);
    const engineReport = await this.engines.setup(this);
    this.#log.info('Engines:');
    for (const module of engineReport.modules) {
      this.#log.info(`${module.enabled ? '*' : '-'} ${module.name}: ${module.description}`);
    }
    await this.data.setup(this.engines.getStore(), this.#log.error);
    this.#log.debug?.('Data:', this.data);
    const pluginReport = await this.plugins.setup();
    this.#log.info('Plugins:');
    for (const module of pluginReport.modules) {
      this.#log.info(`${module.enabled ? '*' : '-'} ${module.name}: ${module.description}`);
    }
    const attachReport = await this.attach(this.plugins, { type: 'app', app: this });
    this.#log.debug?.('Attachments:', attachReport, this.attachments);
    await Promise.all([this.discord.setup(this, pluginReport.events), this.home.setup(this)]);
    this.#log.info('Ready');
    this.#status = Status.ready;
    this.emit('ready');
  }

  async destroy(reason: string): Promise<void> {
    if (this.#status !== Status.ready) return;
    this.#status = Status.destroying;
    await this.hook('destroy', reason).catch(this.#log.error);
    await Promise.all([this.discord.destroy().catch(this.#log.error), this.home.destroy().catch(this.#log.error)]);
    await this.data.destroy().catch(this.#log.error);
    this.#log.info(`Destroyed by ${reason}`);
    this.#status = Status.destroyed;
  }

  static argv(): Argv {
    const argv: Argv = {};
    let name: string | undefined;
    for (const arg of process.argv.slice(2)) {
      if (arg.startsWith('--')) name = arg.slice(2);
      if (!name) continue;
      const value = argv[name];
      if (Array.isArray(value)) {
        value.push(arg);
      } else {
        argv[name] = [];
      }
    }
    return argv;
  }

  static async env(name = 'default'): Promise<Env> {
    const { env } = (await import(`../../env/${name}`)) as Record<string, Env>;
    if (!env) throw new Error('Invalid env');
    const proxy = new Proxy(env, new EnvProxyHandler(['iwassistant'])) as Env;
    return JSON.parse(JSON.stringify(proxy)) as Env;
  }

  static di(env: Env, debug = false): DI {
    const log = new Logger({ ...env.log, ...(debug ? { level: 'debug' } : {}) });
    const engines = new EngineManager(env.engines, new ModuleLoader('engine', EnginePaths));
    const plugins = new PluginManager(env.plugins, new ModuleLoader('plugin', PluginPaths));
    const discord = new DiscordManager(env.discord, {
      client: new Client({ intents: [] }),
      assistants: new GuildAssistantManager(env.locale, env.guilds, env.assistant),
    });
    const home = new HomeAssistant(env.locale, env.home, env.assistant, { data: new Datastore('home'), log, engines });
    return { data: new Datastore('app'), log, engines, plugins, discord, home };
  }

  static build(locale: Locale, di: DI): App {
    const app = new App(locale, di);
    for (const signal of HaltSignals) {
      process.once(signal, (signal) => {
        app
          .destroy(signal)
          .then(() => process.exit())
          .catch(App.onFatal);
      });
    }
    return app;
  }

  static launch(app?: App): void {
    (async () => {
      if (!app) {
        const argv = App.argv();
        const env = await App.env(argv['env']?.[0]);
        const di = App.di(env, !!argv['debug']);
        app = App.build(env.locale, di);
      }
      await app.setup();
    })().catch(App.onFatal);
  }

  static onFatal = (error: unknown): never => {
    // eslint-disable-next-line no-console
    console.error('[FATAL]', error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  };
}
