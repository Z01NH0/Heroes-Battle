/*
 * ZOINHO Storage Bridge v2 — Heroes Battle V17.30.2
 *
 * Cloud: progresso permanente + recorde.
 * Local por dispositivo: áudio, vídeo, HUD e teclas.
 *
 * Regra importante: a pontuação abaixo mede investimento econômico, não "quantas
 * runas sobraram". Gastar runas em heróis, Skill Tree e cartas não pode fazer um
 * save legítimo parecer mais antigo para o resolvedor de conflitos.
 */
(() => {
  'use strict';

  const PROGRESS_KEY = 'hb-rune-progression-v2';
  const BEST_KEY = 'hb-reforged2-best';
  const FALLBACK_UNLOCK_COSTS = Object.freeze({
    pyromancer: 0, ranger: 10, knight: 13, storm: 20, executioner: 30, engineer: 45
  });
  const FALLBACK_SKILL_COSTS = Object.freeze({
    pyromancer:{py_root:2,py_damage:3,py_shield:3,py_move:4,py_rate:4,py_crit:4,py_special:4,py_t1:7,py_fire:5,py_meteor:5,py_t2:8,py_c1:5,py_t3:8,py_t4:8,py_regen:5,py_c2:7,py_c3:8,py_apex:10},
    ranger:{ra_root:2,ra_damage:3,ra_shield:3,ra_move:4,ra_rate:4,ra_crit:4,ra_special:4,ra_t1:7,ra_arrow:5,ra_range:5,ra_t2:8,ra_c1:5,ra_t3:8,ra_t4:8,ra_dash:5,ra_c2:7,ra_c3:8,ra_apex:10},
    knight:{kn_root:2,kn_damage:3,kn_shield:3,kn_move:4,kn_rate:4,kn_armor:4,kn_special:4,kn_t1:7,kn_mount:5,kn_edge:5,kn_t2:8,kn_c1:5,kn_t3:8,kn_t4:8,kn_regen:5,kn_c2:7,kn_c3:8,kn_apex:10},
    storm:{st_root:2,st_damage:3,st_shield:3,st_move:4,st_rate:4,st_crit:4,st_special:4,st_t1:7,st_storm:5,st_nova:5,st_t2:8,st_c1:5,st_t3:8,st_t4:8,st_regen:5,st_c2:7,st_c3:8,st_apex:10},
    executioner:{ex_root:2,ex_damage:3,ex_shield:3,ex_move:4,ex_rate:4,ex_crit:4,ex_special:4,ex_t1:7,ex_axe:5,ex_mark:5,ex_t2:8,ex_c1:5,ex_t3:8,ex_t4:8,ex_regen:5,ex_c2:7,ex_c3:8,ex_apex:10},
    engineer:{en_root:2,en_damage:3,en_shield:3,en_move:4,en_rate:4,en_crit:4,en_special:4,en_t1:7,en_gear:5,en_turret:5,en_t2:8,en_c1:5,en_t3:8,en_t4:8,en_cap:5,en_c2:7,en_c3:8,en_apex:10}
  });

  const safeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const nonNegativeInt = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };
  const parseProgress = storage => {
    const raw = storage?.[PROGRESS_KEY];
    if (typeof raw !== 'string' || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-progress-json');
    return parsed;
  };
  const runtimeRules = () => {
    const live = window.__HB_PROGRESS_RULES;
    const unlockCosts = safeObject(live?.HERO_UNLOCK_COSTS);
    const trees = safeObject(live?.SKILL_TREES);
    const skillCosts = {};
    for (const hero of Object.keys(FALLBACK_UNLOCK_COSTS)) {
      const nodes = Array.isArray(trees[hero]) ? trees[hero] : [];
      if (nodes.length) {
        skillCosts[hero] = Object.fromEntries(nodes
          .filter(n => n && typeof n.id === 'string' && Number.isFinite(Number(n.cost)))
          .map(n => [n.id, Math.max(0, Number(n.cost))]));
      }
    }
    return {
      unlockCosts: Object.keys(unlockCosts).length ? unlockCosts : FALLBACK_UNLOCK_COSTS,
      skillCosts: Object.keys(skillCosts).length ? skillCosts : FALLBACK_SKILL_COSTS
    };
  };
  const legacyInvestment = hero => {
    const hp = Math.min(8, nonNegativeInt(hero?.hpLevel));
    const dmg = Math.min(8, nonNegativeInt(hero?.dmgLevel));
    return (2 * hp + hp * (hp - 1) / 2) + (3 * dmg + dmg * (dmg - 1) / 2);
  };
  const cardInvestment = hero => {
    const h = safeObject(hero);
    const cards = Array.isArray(h.cards) ? h.cards : [];
    const buys = Math.max(nonNegativeInt(h.cardBuys), cards.length);
    if (!buys) return 0;

    const allCosts = Array.from({ length: buys }, (_, i) => 5 * (i + 1));
    const ownedCosts = [];
    const legacyEntries = [];
    for (const entry of cards) {
      const raw = entry && typeof entry === 'object' ? Number(entry.boughtFor) : NaN;
      if (Number.isFinite(raw) && raw > 0) ownedCosts.push(Math.max(1, Math.round(raw)));
      else legacyEntries.push(entry);
    }

    // Saves antigos não tinham boughtFor. O próprio jogo migra assumindo que as cartas
    // restantes correspondem às compras mais recentes; fazemos a mesma coisa aqui.
    const remaining = [...allCosts];
    for (const cost of ownedCosts) {
      const idx = remaining.indexOf(cost);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    for (let i = 0; i < legacyEntries.length && remaining.length; i++) {
      const cost = remaining.pop();
      ownedCosts.push(cost);
    }

    const totalSpent = allCosts.reduce((sum, value) => sum + value, 0);
    const ownedPool = [...ownedCosts];
    let refunds = 0;
    for (const cost of allCosts) {
      const idx = ownedPool.indexOf(cost);
      if (idx >= 0) ownedPool.splice(idx, 1);
      else refunds += Math.max(1, Math.round(cost * .30));
    }
    return Math.max(0, totalSpent - refunds);
  };
  const progressScore = storage => {
    try {
      const progress = parseProgress(storage);
      const { unlockCosts, skillCosts } = runtimeRules();
      let economic = nonNegativeInt(progress.runes);
      const unlocked = safeObject(progress.unlocked);
      for (const [hero, rawCost] of Object.entries(unlockCosts)) {
        const cost = Number(rawCost);
        if (hero !== 'pyromancer' && unlocked[hero] === true && Number.isFinite(cost) && cost > 0) economic += cost;
      }
      const heroes = safeObject(progress.heroes);
      for (const hero of Object.keys(FALLBACK_UNLOCK_COSTS)) {
        const h = safeObject(heroes[hero]);
        economic += legacyInvestment(h);
        const ownedNodes = new Set(Array.isArray(h.skillNodes) ? h.skillNodes.filter(id => typeof id === 'string') : []);
        const costs = safeObject(skillCosts[hero] || FALLBACK_SKILL_COSTS[hero]);
        for (const id of ownedNodes) {
          const cost = Number(costs[id]);
          if (Number.isFinite(cost) && cost > 0) economic += cost;
        }
        economic += cardInvestment(h);
      }
      return Number.isFinite(economic) ? economic : null;
    } catch {
      return null;
    }
  };

  const mergeStorage = (winnerStorage, otherStorage) => {
    const winner = { ...(winnerStorage || {}) };
    try {
      const base = parseProgress(winner);
      const other = parseProgress(otherStorage || {});
      const bBestiary = safeObject(base.bestiaryKills);
      const oBestiary = safeObject(other.bestiaryKills);
      base.bestiaryKills = { ...bBestiary };
      for (const [id, value] of Object.entries(oBestiary)) {
        base.bestiaryKills[id] = Math.max(nonNegativeInt(base.bestiaryKills[id]), nonNegativeInt(value));
      }
      base.cardTutorialSeen = base.cardTutorialSeen === true || other.cardTutorialSeen === true;

      const bHeroes = safeObject(base.heroes);
      const oHeroes = safeObject(other.heroes);
      for (const hero of Object.keys(FALLBACK_UNLOCK_COSTS)) {
        if (!bHeroes[hero] || typeof bHeroes[hero] !== 'object' || Array.isArray(bHeroes[hero])) continue;
        const seen = safeObject(bHeroes[hero].combatInfoSeen);
        const otherSeen = safeObject(oHeroes[hero]?.combatInfoSeen);
        bHeroes[hero].combatInfoSeen = {
          weapon: seen.weapon === true || otherSeen.weapon === true,
          special: seen.special === true || otherSeen.special === true
        };
      }
      base.heroes = bHeroes;
      winner[PROGRESS_KEY] = JSON.stringify(base);
    } catch {
      // Se um lado estiver corrompido, o resolvedor não inventa um merge econômico.
    }

    const bestA = Number(winner?.[BEST_KEY]);
    const bestB = Number(otherStorage?.[BEST_KEY]);
    const safeA = Number.isFinite(bestA) && bestA > 0 ? bestA : 0;
    const safeB = Number.isFinite(bestB) && bestB > 0 ? bestB : 0;
    if (safeA || safeB) winner[BEST_KEY] = String(Math.max(safeA, safeB));
    return winner;
  };

  window.ZOINHO_STORAGE_CONFIG = Object.freeze({
    gameId: 'heroes-battle',
    displayName: 'Heroes Battle',
    bridgeVersion: 2,
    portalOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    allowOriginApproval: true,
    saveKeys: [PROGRESS_KEY, BEST_KEY],
    progressScore,
    mergeStorage,
    runtimeReady: () => Boolean(window.__HB_PROGRESS_RULES)
  });
})();
