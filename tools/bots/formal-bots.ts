import {HeuristicBot} from './heuristic-bot';
import type {BotConfig} from './types';
export class WeakBot extends HeuristicBot {constructor(c:BotConfig,hash:string){super('weak',c,hash);}}
export class MediumBot extends HeuristicBot {constructor(c:BotConfig,hash:string){super('medium',c,hash);}}
export class StrongBot extends HeuristicBot {constructor(c:BotConfig,hash:string){super('strong',c,hash);}}
