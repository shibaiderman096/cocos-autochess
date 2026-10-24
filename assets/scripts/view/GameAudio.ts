import { _decorator, AudioClip, AudioSource, Component, director, game, Game, input, Input, isValid, Node, resources, sys } from 'cc';

const { ccclass } = _decorator;
const SOUNDS = {
  click: { gain: .45, cooldown: 70 }, confirm: { gain: .65, cooldown: 120 },
  refresh: { gain: .6, cooldown: 120 }, place: { gain: .65, cooldown: 90 },
  buy: { gain: .7, cooldown: 100 }, sell: { gain: .65, cooldown: 100 },
  equip: { gain: .65, cooldown: 100 }, upgrade: { gain: .85, cooldown: 300 },
  error: { gain: .5, cooldown: 350 },
  melee: { gain: .3, cooldown: 150 }, ranged: { gain: .25, cooldown: 180 },
  hit: { gain: .25, cooldown: 180 }, cast: { gain: .45, cooldown: 260 },
  heal: { gain: .35, cooldown: 400 },
  battle_start: { gain: .7, cooldown: 500 }, victory: { gain: .85, cooldown: 500 },
  defeat: { gain: .7, cooldown: 500 },
  ranged_arrow: { gain: .3, cooldown: 160 }, ranged_magic: { gain: .26, cooldown: 190 },
  ranged_mechanical: { gain: .25, cooldown: 180 },
  cast_shadow: { gain: .48, cooldown: 280 }, cast_sunlight: { gain: .45, cooldown: 280 },
  cast_astral: { gain: .48, cooldown: 280 }, cast_mechanical: { gain: .45, cooldown: 280 },
  shield: { gain: .4, cooldown: 450 }, stun: { gain: .35, cooldown: 400 },
  death: { gain: .3, cooldown: 250 }, teleport: { gain: .4, cooldown: 350 },
  dash: { gain: .35, cooldown: 350 }, meteor: { gain: .45, cooldown: 600 },
  explosion: { gain: .45, cooldown: 600 }, rail: { gain: .4, cooldown: 450 },
  lock: { gain: .55, cooldown: 120 }, unlock: { gain: .55, cooldown: 120 },
  chest: { gain: .65, cooldown: 400 }, reward: { gain: .65, cooldown: 160 },
  portal: { gain: .65, cooldown: 600 }, level_up: { gain: .7, cooldown: 400 },
  boss_start: { gain: .75, cooldown: 500 }, wave: { gain: .5, cooldown: 400 },
} as const;
export type SoundId = keyof typeof SOUNDS;
const VARIANTS: Partial<Record<SoundId, readonly string[]>> = {
  click: ['click', 'click_2', 'click_3'], melee: ['melee', 'melee_2', 'melee_3'], ranged: ['ranged', 'ranged_2'],
};
type Lane = 'ui' | 'battle' | 'ability' | 'cue';
const BATTLE = new Set<SoundId>(['melee', 'ranged', 'ranged_arrow', 'ranged_magic', 'ranged_mechanical', 'hit']);
const ABILITIES = new Set<SoundId>(['cast', 'cast_shadow', 'cast_sunlight', 'cast_astral', 'cast_mechanical', 'heal', 'shield', 'stun', 'death', 'teleport', 'dash', 'meteor', 'explosion', 'rail']);
const CUES = new Set<SoundId>(['battle_start', 'boss_start', 'victory', 'defeat', 'portal', 'level_up']);
const STORAGE_KEY = 'autochess.audioVolume';
const MUSIC_STORAGE_KEY = 'autochess.musicVolume';
const MUSIC = { menu: .85, prepare: .8, battle: .75, boss: .75 } as const;
export type MusicId = keyof typeof MUSIC;
interface MusicVoice { source: AudioSource; id: MusicId | null; weight: number; target: number; running: boolean }

/** Presentation only: bounded voices, real-time throttling, no delayed playback queue. */
@ccclass('GameAudio')
export class GameAudio extends Component {
  private static current: GameAudio | null = null;
  private static savedVolume: number | undefined;
  private static savedMusicVolume: number | undefined;
  private static musicId: MusicId | null = null;
  private clips = new Map<string, AudioClip>();
  private voices: Record<Lane, AudioSource[]> = { ui: [], battle: [], ability: [], cue: [] };
  private variants = new Map<SoundId, number>();
  private lastPlayed = new Map<SoundId, number>();
  private lastBattle = -Infinity;
  private lastAbility = -Infinity;
  private unlocked = false;
  private hidden = false;
  private musicVoices: MusicVoice[] = [];
  private musicClips = new Map<MusicId, AudioClip>();
  private musicLoading = new Set<MusicId>();
  private duckRemaining = 0;

  static mount(parent: Node): void {
    if (this.current?.isValid) return;
    const node = new Node('GameAudio'); parent.addChild(node); node.addComponent(GameAudio);
  }

  static get volume(): number {
    if (this.savedVolume === undefined) {
      try {
        const raw = sys.localStorage.getItem(STORAGE_KEY);
        const value = raw === null ? .6 : Number(raw);
        this.savedVolume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .6;
      } catch { this.savedVolume = .6; }
    }
    return this.savedVolume;
  }

  static setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.savedVolume = Math.max(0, Math.min(1, value));
    try { sys.localStorage.setItem(STORAGE_KEY, String(this.savedVolume)); } catch { /* Session preference still works. */ }
    this.current?.stopAll();
  }

  static play(id: SoundId): void { this.current?.playSound(id); }

  static get musicVolume(): number {
    if (this.savedMusicVolume === undefined) {
      try {
        const raw = sys.localStorage.getItem(MUSIC_STORAGE_KEY), value = raw === null ? .3 : Number(raw);
        this.savedMusicVolume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .3;
      } catch { this.savedMusicVolume = .3; }
    }
    return this.savedMusicVolume;
  }

  static setMusicVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.savedMusicVolume = Math.max(0, Math.min(1, value));
    try { sys.localStorage.setItem(MUSIC_STORAGE_KEY, String(this.savedMusicVolume)); } catch { /* Session preference still works. */ }
    this.current?.syncMusic();
  }

  static setMusic(id: MusicId): void { this.musicId = id; this.current?.syncMusic(); }

  onLoad(): void {
    if (GameAudio.current?.isValid && GameAudio.current !== this) { this.node.destroy(); return; }
    GameAudio.current = this;
    // Persistence requires a direct child of the scene, rather than the Canvas/Stage.
    director.getScene()!.addChild(this.node); director.addPersistRootNode(this.node);
    for (const [lane, count] of [['ui', 3], ['battle', 3], ['ability', 3], ['cue', 1]] as const) {
      for (let i = 0; i < count; i++) {
        const node = new Node(`${lane}_${i}`); this.node.addChild(node);
        const source = node.addComponent(AudioSource); source.playOnAwake = false;
        this.voices[lane].push(source);
      }
    }
    for (let i = 0; i < 2; i++) {
      const node = new Node(`music_${i}`); this.node.addChild(node);
      const source = node.addComponent(AudioSource); source.playOnAwake = false; source.loop = true; source.volume = 0;
      this.musicVoices.push({ source, id: null, weight: 0, target: 0, running: false });
    }
    const clips = new Set([...Object.keys(SOUNDS), ...Object.values(VARIANTS).flat()]);
    for (const id of clips) {
      resources.load(`audio/sfx/${id}`, AudioClip, (error, clip) => {
        if (!this.isValid) return;
        if (error) { console.warn(`[GameAudio] Failed to load ${id}: ${error.message}`); return; }
        this.clips.set(id, clip);
      });
    }
    for (const type of [Input.EventType.TOUCH_START, Input.EventType.MOUSE_DOWN, Input.EventType.KEY_DOWN] as const) input.on(type, this.unlock, this);
    game.on(Game.EVENT_HIDE, this.onHide, this); game.on(Game.EVENT_SHOW, this.onShow, this);
  }

  private unlock(): void { this.unlocked = true; this.syncMusic(); }
  private onHide(): void { this.hidden = true; this.stopAll(); this.syncMusic(); }
  private onShow(): void { this.hidden = false; this.syncMusic(); }
  private stopAll(): void { for (const sources of Object.values(this.voices)) for (const source of sources) if (isValid(source, true)) source.stop(); }

  private playSound(id: SoundId): void {
    if (!this.isValid || this.hidden || !this.unlocked || GameAudio.volume <= 0) return;
    const spec = SOUNDS[id], now = Date.now();
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < spec.cooldown) return;
    const lane: Lane = BATTLE.has(id) ? 'battle' : ABILITIES.has(id) ? 'ability' : CUES.has(id) ? 'cue' : 'ui';
    if (lane === 'battle' && now - this.lastBattle < 85) return;
    if (lane === 'ability' && now - this.lastAbility < 110) return;
    const choices = VARIANTS[id] ?? [id], variant = this.variants.get(id) ?? 0;
    const clip = this.clips.get(choices[variant % choices.length]); if (!clip) return;
    if (lane === 'cue') {
      for (const source of [...this.voices.battle, ...this.voices.ability, ...this.voices.cue]) source.stop();
      this.duckRemaining = 1.6;
    }
    const source = this.voices[lane].find(voice => !voice.playing);
    if (!source) return;
    source.clip = clip; source.loop = false; source.volume = spec.gain * GameAudio.volume;
    source.play();
    this.variants.set(id, variant + 1);
    this.lastPlayed.set(id, now); if (lane === 'battle') this.lastBattle = now;
    if (lane === 'ability') this.lastAbility = now;
  }

  /** Load only the requested score; old callbacks cannot replace a newer scene's music. */
  private syncMusic(): void {
    if (!isValid(this, true)) return;
    const id = GameAudio.musicId;
    if (this.hidden || !this.unlocked || GameAudio.musicVolume <= 0 || !id) {
      for (const voice of this.musicVoices) if (voice.running) { voice.source.pause(); voice.running = false; }
      return;
    }
    const clip = this.musicClips.get(id);
    if (!clip) {
      if (this.musicLoading.has(id)) return;
      this.musicLoading.add(id);
      resources.load(`audio/music/${id}`, AudioClip, (error, loaded) => {
        this.musicLoading.delete(id);
        if (error) { console.warn(`[GameAudio] Failed to load music ${id}: ${error.message}`); return; }
        loaded.addRef();
        if (!isValid(this, true)) { loaded.decRef(); return; }
        this.musicClips.set(id, loaded); this.releaseUnusedMusic();
        if (GameAudio.musicId === id) this.syncMusic();
      });
      return;
    }
    let incoming = this.musicVoices.find(voice => voice.id === id);
    if (!incoming) {
      incoming = this.musicVoices.reduce((a, b) => a.weight <= b.weight ? a : b);
      incoming.source.stop(); incoming.source.clip = clip;
      incoming.id = id; incoming.weight = 0; incoming.running = false;
    }
    for (const voice of this.musicVoices) {
      voice.target = voice === incoming ? 1 : 0;
      if (voice.id && (voice.target || voice.weight > 0) && !voice.running) {
        voice.source.volume = voice.weight * MUSIC[voice.id] * GameAudio.musicVolume;
        voice.source.play(); voice.running = true;
      }
    }
    this.releaseUnusedMusic();
    this.update(0);
  }

  update(dt: number): void {
    if (this.hidden || !this.unlocked || GameAudio.musicVolume <= 0) return;
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.duckRemaining = Math.max(0, this.duckRemaining - elapsed);
    for (const voice of this.musicVoices) {
      if (!voice.id) continue;
      const step = elapsed / .65;
      voice.weight = voice.target > voice.weight ? Math.min(voice.target, voice.weight + step) : Math.max(voice.target, voice.weight - step);
      voice.source.volume = voice.weight * MUSIC[voice.id] * GameAudio.musicVolume * (this.duckRemaining > 0 ? .35 : 1);
      if (voice.weight === 0 && voice.target === 0) {
        voice.source.stop(); voice.source.clip = null; voice.id = null; voice.running = false;
      }
    }
    this.releaseUnusedMusic();
  }

  private releaseUnusedMusic(): void {
    for (const [id, clip] of this.musicClips) {
      if (id === GameAudio.musicId || this.musicVoices.some(voice => voice.id === id)) continue;
      this.musicClips.delete(id); clip.decRef();
    }
  }

  onDestroy(): void {
    this.stopAll(); this.clips.clear();
    for (const voice of this.musicVoices) if (isValid(voice.source, true)) { voice.source.stop(); voice.source.clip = null; }
    for (const clip of this.musicClips.values()) clip.decRef();
    this.musicClips.clear(); this.musicLoading.clear();
    for (const type of [Input.EventType.TOUCH_START, Input.EventType.MOUSE_DOWN, Input.EventType.KEY_DOWN] as const) input.off(type, this.unlock, this);
    game.off(Game.EVENT_HIDE, this.onHide, this); game.off(Game.EVENT_SHOW, this.onShow, this);
    if (GameAudio.current === this) GameAudio.current = null;
  }
}
