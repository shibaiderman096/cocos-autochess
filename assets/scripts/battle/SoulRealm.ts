import type {ConfigManager, SkillConfigData} from '../core/ConfigManager';
import type {BattleEvent, Side} from './types';
import type {Unit} from './Unit';
import {applyHealing} from './Healing';

interface Host {units:Unit[];events:BattleEvent[];now:()=>number;fear:(source:Unit,target:Unit,seconds:number)=>void;}
/** Battle-owned stats and fields. No owned-unit/save objects are mutated. */
export class SoulRealm {
  private opened=new Set<Unit>();
  private fields=new Map<Side,{move:number;attack:number}>();
  private growth=new Map<Unit,{physical:number;spell:number}>();
  constructor(private host:Host,private configs:ConfigManager){}
  private adjust(unit:Unit,physical:number,spell:number):void {
    unit.cfg.physicalPower=(unit.cfg.physicalPower??0)+physical;
    unit.adjustSpellPower(spell);
    const previous=this.growth.get(unit)??{physical:0,spell:0};
    this.growth.set(unit,{physical:previous.physical+physical,spell:previous.spell+spell});
  }
  onDeath(dead:Unit):void {
    for(const unit of this.host.units){
      if(!unit.alive||unit.hp<=0||!unit.deathManaOnly)continue;
      const spec=this.configs.getSkill(unit.cfg.skillId!).soulRealm!;
      unit.gainMana(spec.manaPerDeath,'death');
      this.adjust(unit,0,spec.spellPowerPerDeath[unit.star-1]);
      this.host.events.push({t:'soul_gain',tick:this.host.now(),id:unit.id,from:dead.pos,to:unit.pos});
    }
  }
  cast(source:Unit,skill:SkillConfigData):void {
    const spec=skill.soulRealm!,rank=source.star-1,tick=this.host.now();
    source.mana=0;
    const enemies=this.host.units.filter(u=>u.alive&&u.hp>0&&u.side!==source.side);
    // Snapshot before stealing: target order never amplifies later targets' healing or fear.
    const power=1+(source.cfg.spellPower??0)/100;
    if(!this.opened.has(source)){
      this.opened.add(source);source.cfg.maxMana-=spec.manaReduction;
      const previous=this.fields.get(source.side);
      this.fields.set(source.side,{move:Math.max(previous?.move??0,spec.moveSlow),attack:Math.max(previous?.attack??0,spec.attackSlow)});
      this.refresh();
      this.host.events.push({t:'soul_realm',tick,id:source.id,side:source.side});
      for(const enemy of enemies)this.host.fear(source,enemy,spec.fearSeconds*power);
      return;
    }
    for(const target of enemies){
      const physical=Math.min(Math.max(0,target.cfg.physicalPower??0),spec.stealPower[rank]);
      const spell=Math.min(Math.max(0,target.cfg.spellPower??0),spec.stealPower[rank]);
      this.adjust(target,-physical,-spell);this.adjust(source,physical,spell);
      applyHealing(source,source,spec.healPerEnemy[rank]*power,tick,this.host.events);
      this.host.events.push({t:'soul_drain',tick,id:source.id,target:target.id,from:target.pos,to:source.pos,physical,spell});
    }
  }
  refresh():void {
    for(const unit of this.host.units){
      const field=this.fields.get(unit.side===0?1:0);
      unit.soulMoveSlow=field?.move??0;unit.soulAttackSlow=field?.attack??0;
    }
  }
  clear():void {
    for(const [unit,amount]of this.growth){unit.cfg.physicalPower=(unit.cfg.physicalPower??0)-amount.physical;unit.adjustSpellPower(-amount.spell);}
    for(const unit of this.opened){unit.cfg.maxMana+=this.configs.getSkill(unit.cfg.skillId!).soulRealm!.manaReduction;unit.mana=Math.min(unit.mana,unit.cfg.maxMana);}
    this.growth.clear();this.opened.clear();this.fields.clear();this.refresh();
  }
}
