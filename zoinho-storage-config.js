/*
 * ZOINHO Storage Bridge v2 - Heroes Battle V17.10+
 *
 * Progresso permanente sincronizado:
 *   - hb-rune-progression-v2
 *       runas, heróis, upgrades, cartas, tutorial e Bestiário Arcano
 *   - hb-reforged2-best
 *       recorde de pontuação
 *
 * Preferências de vídeo/áudio/controles permanecem locais:
 *   - hb-pixel-reforged-settings-v3 (e migrações v2/v1)
 */
window.ZOINHO_STORAGE_CONFIG = Object.freeze({
  gameId: 'heroes-battle',
  displayName: 'Heroes Battle',
  bridgeVersion: 2,
  portalOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  allowOriginApproval: true,
  saveKeys: [
    'hb-rune-progression-v2',
    'hb-reforged2-best'
  ],

  /*
   * Comparador semântico para conflitos.
   *
   * Runas diminuem legitimamente quando o jogador compra conteúdo, então "mais runas"
   * não significa "save mais avançado". O score econômico recompõe:
   * - runas disponíveis;
   * - custo de heróis desbloqueados;
   * - custo acumulado de HP/dano;
   * - histórico de compras de cartas (cardBuys é cumulativo).
   *
   * Bestiário é monotônico e entra como desempate fracionário entre saves com a mesma
   * progressão econômica. O recorde entra depois, também só como desempate.
   */
  progressScore(storage) {
    try {
      const raw = storage?.['hb-rune-progression-v2'];
      let progress = {};
      if (typeof raw === 'string' && raw) progress = JSON.parse(raw) || {};

      let economic = Math.max(0, Math.floor(Number(progress.runes) || 0));

      const unlocked = progress.unlocked && typeof progress.unlocked === 'object'
        ? progress.unlocked
        : {};
      const unlockCosts = { ranger: 10, knight: 13, storm: 20 };
      for (const [hero, cost] of Object.entries(unlockCosts)) {
        if (unlocked[hero] === true) economic += cost;
      }

      const heroes = progress.heroes && typeof progress.heroes === 'object'
        ? progress.heroes
        : {};
      for (const hero of ['pyromancer', 'ranger', 'knight', 'storm']) {
        const h = heroes[hero] && typeof heroes[hero] === 'object' ? heroes[hero] : {};
        const hp = Math.max(0, Math.min(8, Math.floor(Number(h.hpLevel) || 0)));
        const dmg = Math.max(0, Math.min(8, Math.floor(Number(h.dmgLevel) || 0)));
        const cardBuys = Math.max(0, Math.floor(Number(h.cardBuys) || 0));

        // HP: 2 + 3 + ... + (L+1)
        economic += 2 * hp + hp * (hp - 1) / 2;
        // Dano: 3 + 4 + ... + (L+2)
        economic += 3 * dmg + dmg * (dmg - 1) / 2;
        // Cartas: 5 + 10 + 15 + ... + 5N
        economic += 5 * cardBuys * (cardBuys + 1) / 2;
      }

      let bestiaryTotal = 0;
      const bestiary = progress.bestiaryKills && typeof progress.bestiaryKills === 'object'
        ? progress.bestiaryKills
        : {};
      for (const value of Object.values(bestiary)) {
        bestiaryTotal += Math.max(0, Math.floor(Number(value) || 0));
      }
      bestiaryTotal = Math.min(999_999, bestiaryTotal);

      const bestRaw = storage?.['hb-reforged2-best'];
      const best = Math.max(0, Math.min(999_999_999, Number(bestRaw) || 0));

      // Uma unidade econômica sempre vence os desempates fracionários.
      const score = economic + (bestiaryTotal / 1_000_000) + (best / 1_000_000_000_000_000);
      return Number.isFinite(score) ? score : null;
    } catch {
      return null;
    }
  }
});
