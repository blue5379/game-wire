import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameData } from './types';

vi.mock('./finalize-game-metadata.js', async (importActual) => {
  const actual = await importActual<typeof import('./finalize-game-metadata.js')>();
  return {
    ...actual,
    finalizeGameMetadata: vi.fn(),
  };
});

import {
  selectIndieGamesWithFallback,
  meetsPopularityThreshold,
  vetIndieCandidate,
} from './select-indie-with-fallback';
import { finalizeGameMetadata } from './finalize-game-metadata.js';

const mockFinalize = vi.mocked(finalizeGameMetadata);

function makeGame(overrides: Partial<GameData>): GameData {
  return {
    title: 'Game',
    normalizedTitle: 'game',
    genres: [],
    platforms: [],
    source: ['steam'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────
// meetsPopularityThreshold（純粋関数のユニットテスト）
// ────────────────────────────────────────────────
describe('meetsPopularityThreshold', () => {
  it('steamRecommendations >= 5000 → true', () => {
    const g = makeGame({ steamRecommendations: 5000 });
    expect(meetsPopularityThreshold(g)).toBe(true);
  });

  it('steamRecommendations < 5000 alone → false', () => {
    const g = makeGame({ steamRecommendations: 4999 });
    expect(meetsPopularityThreshold(g)).toBe(false);
  });

  it('steamRank <= 200 → true', () => {
    const g = makeGame({ steamRank: 1 });
    expect(meetsPopularityThreshold(g)).toBe(true);
  });

  it('steamRank = 200（境界値ちょうど） → true', () => {
    const g = makeGame({ steamRank: 200 });
    expect(meetsPopularityThreshold(g)).toBe(true);
  });

  it('steamRank > 200 alone → false', () => {
    const g = makeGame({ steamRank: 201 });
    expect(meetsPopularityThreshold(g)).toBe(false);
  });

  it('no data at all → false', () => {
    const g = makeGame({});
    expect(meetsPopularityThreshold(g)).toBe(false);
  });

  // Issue #235 回帰テスト: 話題性判定から YouTube 経路を削除したことの固定化。
  // ポジティブコントロール（steamRecommendations=5000 → true, steamRank=200 → true）は
  // 上記の既存テストで確認済みなので、ここでは YouTube 単独では通らないことのみを確認する。
  it('youtubePopularity が巨大でも steamRecommendations / steamRank が閾値未満なら false（YouTube 経路は削除済み）', () => {
    const g = makeGame({
      youtubePopularity: 10_000_000,
      steamRecommendations: 4999,
      steamRank: 201,
    });
    expect(meetsPopularityThreshold(g)).toBe(false);
  });
});

// ────────────────────────────────────────────────
// selectIndieGamesWithFallback
// ────────────────────────────────────────────────
describe('selectIndieGamesWithFallback - 通常ルート', () => {
  it('ranked=[A,B] どちらも ok → adopted=[A,B]', async () => {
    const A = makeGame({ title: 'Game A', normalizedTitle: 'game a' });
    const B = makeGame({ title: 'Game B', normalizedTitle: 'game b' });
    const finishedA = { ...A, developer: 'Dev A', coverImage: 'https://x.com/a.jpg', sourceUrls: { steam: 'https://s.com/a' } };
    const finishedB = { ...B, developer: 'Dev B', coverImage: 'https://x.com/b.jpg', sourceUrls: { steam: 'https://s.com/b' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedA })
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    const result = await selectIndieGamesWithFallback([A, B], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0].title).toBe('Game A');
    expect(result.adopted[1].title).toBe('Game B');
    expect(result.rejected).toHaveLength(0);
  });

  it('ranked=[A,B,C] A が rejected → B,C から2件採用', async () => {
    const A = makeGame({ title: 'Game A', normalizedTitle: 'game a' });
    const B = makeGame({ title: 'Game B', normalizedTitle: 'game b' });
    const C = makeGame({ title: 'Game C', normalizedTitle: 'game c' });
    const finishedB = { ...B, developer: 'Dev B', coverImage: 'https://x.com/b.jpg', sourceUrls: { steam: 'https://s.com/b' } };
    const finishedC = { ...C, developer: 'Dev C', coverImage: 'https://x.com/c.jpg', sourceUrls: { steam: 'https://s.com/c' } };

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'date-mismatch' as const, game: A })
      .mockResolvedValueOnce({ ok: true, game: finishedB })
      .mockResolvedValueOnce({ ok: true, game: finishedC });

    const result = await selectIndieGamesWithFallback([A, B, C], 2);
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0].title).toBe('Game B');
    expect(result.adopted[1].title).toBe('Game C');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Game A');
  });

  it('全件 reject → adopted=[], rejected に全件', async () => {
    const A = makeGame({ title: 'A', normalizedTitle: 'a' });
    const B = makeGame({ title: 'B', normalizedTitle: 'b' });

    mockFinalize
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: A })
      .mockResolvedValueOnce({ ok: false, reason: 'still-missing-required' as const, game: B });

    const result = await selectIndieGamesWithFallback([A, B], 2);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it('ranked=[] → adopted=[], rejected=[]', async () => {
    const result = await selectIndieGamesWithFallback([], 2);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    expect(mockFinalize).not.toHaveBeenCalled();
  });
});

describe('selectIndieGamesWithFallback - 話題性ルート', () => {
  it('developer のみ欠落 + 話題性閾値 OK → steamRawDeveloper をそのまま developer に採用', async () => {
    const candidate = makeGame({
      title: 'Popular Indie',
      normalizedTitle: 'popular indie',
      steamRawDeveloper: 'dev_account',
      steamRecommendations: 6000,
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/99999' },
    });
    const gameAfterFinalize = {
      ...candidate,
      // developer is still missing after finalize (isQualifiedCompanyName rejected account name)
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].developer).toBe('dev_account');
    expect(result.rejected).toHaveLength(0);
  });

  it('developer のみ欠落 + 話題性閾値 NG → rejected', async () => {
    const candidate = makeGame({
      title: 'Niche Indie',
      normalizedTitle: 'niche indie',
      steamRawDeveloper: 'tiny_dev',
      steamRecommendations: 100, // 5000 未満
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/11111' },
    });
    const gameAfterFinalize = { ...candidate };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Niche Indie');
  });

  it('cover が欠落 → 話題性ルートは起動しない（cover 欠落は代替不可）', async () => {
    const candidate = makeGame({
      title: 'No Cover Game',
      normalizedTitle: 'no cover game',
      steamRawDeveloper: 'dev_account',
      steamRecommendations: 10000, // 話題性は十分
      // coverImage = undefined
      sourceUrls: { steam: 'https://store.steampowered.com/app/22222' },
    });
    const gameAfterFinalize = {
      ...candidate,
      // coverImage still undefined, developer still undefined
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    // developer ではなく cover が原因の場合は補完できないため不採用
    expect(result.rejected[0].title).toBe('No Cover Game');
  });

  it('steamRawDeveloper が undefined のとき → developer を埋められないため不採用', async () => {
    const candidate = makeGame({
      title: 'Mystery Dev Game',
      normalizedTitle: 'mystery dev game',
      // steamRawDeveloper: undefined,
      steamRecommendations: 7000,
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/33333' },
    });
    const gameAfterFinalize = { ...candidate };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].title).toBe('Mystery Dev Game');
  });

  // Vol.12 再発防止テスト: めっちゃカメレオン相当の fixture
  it('めっちゃカメレオン相当: lemorion_1224（reviews=11179, CDN=landscape）→ 話題性ルートで採用', async () => {
    const mechaChamRaw: GameData = {
      title: 'めっちゃカメレオン',
      normalizedTitle: 'めっちゃかめれおん',
      genres: ['アクション'],
      platforms: ['PC'],
      source: ['steam'],
      steamAppId: 4704690,
      steamRawDeveloper: 'lemorion_1224',
      steamRecommendations: 11179,
      coverImage: 'https://cdn.akamai.steamstatic.com/steam/apps/4704690/header.jpg',
      coverImageOrientation: 'landscape',
      sourceUrls: { steam: 'https://store.steampowered.com/app/4704690' },
      // developer: undefined  ← isQualifiedCompanyName が 'lemorion_1224' を弾いた
    };

    // finalizeGameMetadata は coverImage と sourceUrl は確認できるが developer は埋められない
    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: mechaChamRaw,
    });

    const result = await selectIndieGamesWithFallback([mechaChamRaw], 1);

    expect(result.adopted).toHaveLength(1);
    const adopted = result.adopted[0];
    expect(adopted.developer).toBe('lemorion_1224');
    expect(adopted.coverImage).toBe('https://cdn.akamai.steamstatic.com/steam/apps/4704690/header.jpg');
    expect(adopted.coverImageOrientation).toBe('landscape');
    expect(adopted.steamRecommendations).toBe(11179);
    expect(result.rejected).toHaveLength(0);
  });

  // Issue #274 回帰テスト: meetsPopularityThreshold は finalize 後のオブジェクトを見るべき。
  // 既存の「めっちゃカメレオン」テストは入力側とモック戻り値側で同一オブジェクトを使っており
  // finalize 前後の区別に対して盲目だった（steamRecommendations が入力側にも既にあるため、
  // 修正前の meetsPopularityThreshold(game) でも通ってしまう）。
  // ここでは入力側に steamRecommendations を持たせず、finalize のモック戻り値にだけ持たせることで、
  // 「finalize 前を見る実装」と「finalize 後を見る実装」を区別できるテストにする。
  describe('Issue #274: finalize で Storefront 補完された steamRecommendations の反映', () => {
    it('入力に steamRecommendations が無く、finalize 戻り値にのみ steamRecommendations=11179（閾値超）がある場合は話題性ルートで採用される', async () => {
      const candidate = makeGame({
        title: 'Storefront Enriched Indie',
        normalizedTitle: 'storefront enriched indie',
        steamRawDeveloper: 'solo_dev_account',
        coverImage: 'https://example.com/cover.jpg',
        sourceUrls: { steam: 'https://store.steampowered.com/app/55555' },
        // steamRecommendations は入力側に無い（Storefront 補完前）
      });
      expect(candidate.steamRecommendations).toBeUndefined();

      const gameAfterFinalize = {
        ...candidate,
        steamRecommendations: 11179, // finalize 内で Storefront API から取得された値
        // developer は依然として欠落（isQualifiedCompanyName がアカウント名を弾いた想定）
      };

      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: gameAfterFinalize,
      });

      const result = await selectIndieGamesWithFallback([candidate], 1);

      expect(result.adopted).toHaveLength(1);
      expect(result.adopted[0].developer).toBe('solo_dev_account');
      expect(result.adopted[0].steamRecommendations).toBe(11179);
      expect(result.rejected).toHaveLength(0);
    });

    // ネガティブコントロール: 「採用されること」だけを検証するテストは常に採用する実装でも
    // 通ってしまうため、閾値未満では不採用になることを併せて確認する。
    it('ネガティブコントロール: finalize 戻り値の steamRecommendations が閾値未満（4999）なら採用されない', async () => {
      const candidate = makeGame({
        title: 'Storefront Enriched Niche',
        normalizedTitle: 'storefront enriched niche',
        steamRawDeveloper: 'solo_dev_account_2',
        coverImage: 'https://example.com/cover2.jpg',
        sourceUrls: { steam: 'https://store.steampowered.com/app/55556' },
      });
      expect(candidate.steamRecommendations).toBeUndefined();

      const gameAfterFinalize = {
        ...candidate,
        steamRecommendations: 4999, // 閾値未満
      };

      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: gameAfterFinalize,
      });

      const result = await selectIndieGamesWithFallback([candidate], 1);

      expect(result.adopted).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].title).toBe('Storefront Enriched Niche');
    });

    // 境界値: POPULARITY_STEAM_REVIEWS_MIN のデフォルト値（select-indie-with-fallback.ts:19 を
    // 目視確認: `Number(process.env.INDIE_POPULARITY_STEAM_REVIEWS_MIN) || 5000`）をリテラルで直書きする。
    // 本番定数の import はしない。
    it('境界値: finalize 戻り値の steamRecommendations がちょうど閾値（5000）なら採用される', async () => {
      const candidate = makeGame({
        title: 'Storefront Enriched Boundary',
        normalizedTitle: 'storefront enriched boundary',
        steamRawDeveloper: 'solo_dev_account_3',
        coverImage: 'https://example.com/cover3.jpg',
        sourceUrls: { steam: 'https://store.steampowered.com/app/55557' },
      });
      expect(candidate.steamRecommendations).toBeUndefined();

      const gameAfterFinalize = {
        ...candidate,
        steamRecommendations: 5000, // リテラル直書き（POPULARITY_STEAM_REVIEWS_MIN の import は禁止されている）
      };

      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: gameAfterFinalize,
      });

      const result = await selectIndieGamesWithFallback([candidate], 1);

      expect(result.adopted).toHaveLength(1);
      expect(result.adopted[0].developer).toBe('solo_dev_account_3');
      expect(result.adopted[0].steamRecommendations).toBe(5000);
    });
  });

  // Issue #167: finalize 後に IGDB が大手スタジオ名を補完した場合の混入防止
  it('finalize 後に developer が Kojima Productions になったゲームは rejected になる', async () => {
    const candidate = makeGame({ title: 'Death Stranding', normalizedTitle: 'death stranding' });
    const finishedGame = {
      ...candidate,
      developer: 'Kojima Productions',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1190460' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  it('finalize 後に developer が PlatinumGames になったゲームは rejected になる', async () => {
    const candidate = makeGame({ title: 'Bayonetta 3', normalizedTitle: 'bayonetta 3' });
    const finishedGame = {
      ...candidate,
      developer: 'PlatinumGames',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1133390' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  // Issue #180: publisher が大手の場合は indie 枠から除外（話題性ルート）
  it('話題性ルートで developer 欠落 + publisher が Nintendo → rejected になる', async () => {
    const candidate = makeGame({
      title: 'Nintendo Contracted Game',
      normalizedTitle: 'nintendo contracted game',
      steamRawDeveloper: 'some_account',
      steamRecommendations: 9000,
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/888888' },
    });
    const gameAfterFinalize = {
      ...candidate,
      publisher: 'Nintendo',
      // developer still undefined after finalize
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  // Issue #180: publisher が大手の場合は indie 枠から除外（通常ルート）
  it('finalize 後に publisher が Bandai Namco（Echoes of Aincrad 相当）→ rejected になる', async () => {
    const candidate = makeGame({ title: 'Echoes of Aincrad', normalizedTitle: 'echoes of aincrad' });
    const finishedGame = {
      ...candidate,
      developer: 'Game Studio Inc.',  // 受託開発スタジオ（大手リストに載っていない）
      publisher: 'Bandai Namco Entertainment Inc.',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/999999' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('not-adopted');
  });

  it('finalize 後に developer が小規模スタジオならそのまま採用される', async () => {
    const candidate = makeGame({ title: 'Hollow Knight', normalizedTitle: 'hollow knight' });
    const finishedGame = {
      ...candidate,
      developer: 'Team Cherry',
      coverImage: 'https://example.com/cover.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/367520' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await selectIndieGamesWithFallback([candidate], 1);
    expect(result.adopted).toHaveLength(1);
    expect(result.adopted[0].developer).toBe('Team Cherry');
  });

  // finalizeGameMetadata の呼び出し回数が採用した候補数と一致すること
  it('finalizeGameMetadata は各候補に対して 1 回だけ呼ばれる', async () => {
    const games = [
      makeGame({ title: 'A', normalizedTitle: 'a', coverImage: 'x', sourceUrls: { steam: 'y' } }),
      makeGame({ title: 'B', normalizedTitle: 'b', coverImage: 'x', sourceUrls: { steam: 'y' } }),
    ];
    const finishedA = { ...games[0], developer: 'Dev A' };
    const finishedB = { ...games[1], developer: 'Dev B' };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedA })
      .mockResolvedValueOnce({ ok: true, game: finishedB });

    await selectIndieGamesWithFallback(games, 2);

    expect(mockFinalize).toHaveBeenCalledTimes(2);
  });

  // Issue #298: 話題性ルートで採用された developer に「個人開発」ラベルが含まれないこと（回帰防止）
  it('話題性ルートで採用された developer に「個人開発」という文字列が含まれず、steamRawDeveloper と一致する', async () => {
    const candidate = makeGame({
      title: 'Regression Test Game',
      normalizedTitle: 'regression test game',
      steamRawDeveloper: 'test_developer',
      steamRecommendations: 8000,
      coverImage: 'https://example.com/regression.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/999999' },
    });
    const gameAfterFinalize = {
      ...candidate,
      // developer is still missing after finalize
    };

    mockFinalize.mockResolvedValueOnce({
      ok: false,
      reason: 'still-missing-required' as const,
      game: gameAfterFinalize,
    });

    const result = await selectIndieGamesWithFallback([candidate], 1);

    expect(result.adopted).toHaveLength(1);
    // ネガティブアサーション: 「個人開発」という文字列が含まれないこと
    expect(result.adopted[0].developer).not.toContain('個人開発');
    // ポジティブアサーション: steamRawDeveloper の生値と一致すること
    expect(result.adopted[0].developer).toBe('test_developer');
  });

  // Issue #280 A: 話題性ルートの大手ゲートは steamRawDeveloper を見るべき
  describe('Issue #280 A: 話題性ルートの大手ゲート（steamRawDeveloper）', () => {
    it('話題性ルートで steamRawDeveloper="Capcom"（単一トークンの大手、developer未設定）→ rejected になる', async () => {
      const candidate = makeGame({
        title: 'Capcom Arcade Game',
        normalizedTitle: 'capcom arcade game',
        steamRawDeveloper: 'Capcom', // isQualifiedCompanyName が弾いた結果、developer は未設定のまま
        steamRecommendations: 9000,
        coverImage: 'https://example.com/capcom.jpg',
        sourceUrls: { steam: 'https://store.steampowered.com/app/777777' },
      });
      const gameAfterFinalize = {
        ...candidate,
        // developer は依然 undefined（話題性ルートの到達条件）
      };

      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: gameAfterFinalize,
      });

      const result = await selectIndieGamesWithFallback([candidate], 1);
      expect(result.adopted).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].title).toBe('Capcom Arcade Game');
    });

    // ポジティブコントロール: 中小の steamRawDeveloper で developerGameCount 未設定 → 採用される
    it('ポジティブコントロール: steamRawDeveloper="NaipSoft"（実データで到達を確認した中小）で developerGameCount 未設定 → steamRawDeveloper をそのまま採用', async () => {
      const candidate = makeGame({
        title: 'NaipSoft Indie Game',
        normalizedTitle: 'naipsoft indie game',
        steamRawDeveloper: 'NaipSoft', // 管理者が実データで到達を確認した実在の中小開発者
        steamRecommendations: 6000,
        coverImage: 'https://example.com/naipsoft.jpg',
        sourceUrls: { steam: 'https://store.steampowered.com/app/333333' },
      });
      const gameAfterFinalize = {
        ...candidate,
        // developerGameCount: undefined（IGDB補完無し）
      };

      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: gameAfterFinalize,
      });

      const result = await selectIndieGamesWithFallback([candidate], 1);
      expect(result.adopted).toHaveLength(1);
      expect(result.adopted[0].developer).toBe('NaipSoft');
      expect(result.rejected).toHaveLength(0);
    });

    // 回帰: publisher 側の大手ゲート（既存）も引き続き機能することを確認
    // （既存のテストで既にカバーされているが、Issue #280 の文脈で明示的に1件追加）
    it('回帰: publisher 側の大手ゲート（Nintendo）は引き続き機能する', async () => {
      const candidate = makeGame({
        title: 'Nintendo Published Indie',
        normalizedTitle: 'nintendo published indie',
        steamRawDeveloper: 'tiny_dev',
        steamRecommendations: 9000,
        coverImage: 'https://example.com/nintendopub.jpg',
        sourceUrls: { steam: 'https://store.steampowered.com/app/222222' },
      });
      const gameAfterFinalize = {
        ...candidate,
        publisher: 'Nintendo',
        // developer still undefined, steamRawDeveloper は中小（既存の Issue #180 テストと同じ構造）
      };

      mockFinalize.mockResolvedValueOnce({
        ok: false,
        reason: 'still-missing-required' as const,
        game: gameAfterFinalize,
      });

      const result = await selectIndieGamesWithFallback([candidate], 1);
      expect(result.adopted).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].title).toBe('Nintendo Published Indie');
    });
  });
});

// ────────────────────────────────────────────────
// selectIndieGamesWithFallback — developerGameCount による大手ゲート（§3.4, Issue #231・PR-I その1）
// 新作枠と逆方向: count が高い候補は除外され、低い候補はインディーとして残ること
// ────────────────────────────────────────────────
describe('selectIndieGamesWithFallback — developerGameCount による大手ゲート (§3.4, Issue #231)', () => {
  it('developerGameCount=241 の候補は大手ゲートで除外され、count=7 の候補はインディーとして残る', async () => {
    const large = makeGame({ title: 'Large By Count', normalizedTitle: 'large by count' });
    const small = makeGame({ title: 'Small By Count', normalizedTitle: 'small by count' });

    const finishedLarge = {
      ...large,
      developer: 'Arc System Works', // 静的リストに無い名前。本数判定のみで除外されることを検証
      developerGameCount: 241,
      coverImage: 'https://x/large.jpg',
      sourceUrls: { steam: 'https://s/large' },
    };
    const finishedSmall = {
      ...small,
      developer: 'Some Tiny Studio',
      developerGameCount: 7,
      coverImage: 'https://x/small.jpg',
      sourceUrls: { steam: 'https://s/small' },
    };

    mockFinalize
      .mockResolvedValueOnce({ ok: true, game: finishedLarge })
      .mockResolvedValueOnce({ ok: true, game: finishedSmall });

    const result = await selectIndieGamesWithFallback([large, small], 2);

    expect(result.adopted.map((g) => g.title)).toContain('Small By Count');
    expect(result.adopted.map((g) => g.title)).not.toContain('Large By Count');
    expect(result.rejected.map((r) => r.title)).toContain('Large By Count');
  });
});

// ────────────────────────────────────────────────
// vetIndieCandidate — Issue #236: 親会社パブリッシャ名が静的リストに無かった穴の回帰テスト
// 実データ（2026-08-10 スナップショット）でインディー枠の大手ゲートを素通りした2件を再現する。
// 修正前（LARGE_DEVELOPERS に Xbox Game Studios / Sony Interactive Entertainment /
// Nippon Ichi Software が無い状態）ではこの2件は publisher 側ゲートに掛からず採用されてしまっていた。
// ────────────────────────────────────────────────
describe('vetIndieCandidate — Issue #236 親会社パブリッシャの大手ゲート回帰テスト', () => {
  it('developer=Halo Studios（16本）/ publisher=Xbox Game Studios の候補は publisher 側ゲートで除外される', async () => {
    const candidate = makeGame({ title: 'Halo: Campaign Evolved', normalizedTitle: 'halo: campaign evolved' });
    const finishedGame = {
      ...candidate,
      developer: 'Halo Studios',
      developerGameCount: 16,
      publisher: 'Xbox Game Studios',
      coverImage: 'https://example.com/halo.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1234567' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await vetIndieCandidate(candidate);
    expect(result).toBeNull();
  });

  // Issue #236 code-review 指摘: publisher="NIS America, Inc." 側のエイリアスは削除済みのため、
  // この候補は developer="Nippon Ichi Software, Inc." 側の静的リスト一致（大手ゲート）で除外される。
  // publisher 側は無関係（'nis america' エイリアスは実データ上の修正効果がゼロだったため削除）。
  it('developer側の静的リスト一致（Nippon Ichi Software, Inc.）で除外される（publisherのNIS America側ではない）', async () => {
    const candidate = makeGame({ title: 'ほの暮しの庭', normalizedTitle: 'ほのぐらしのにわ' });
    const finishedGame = {
      ...candidate,
      developer: 'Nippon Ichi Software, Inc.',
      developerGameCount: 3,
      publisher: 'NIS America, Inc.',
      coverImage: 'https://example.com/honogurashi.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/7654321' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await vetIndieCandidate(candidate);
    expect(result).toBeNull();
  });

  // ポジティブコントロール: 本来インディーの候補が巻き込まれて除外されていないことの確認
  // （「除外されること」だけを検証するテストは、常に null を返す実装でも通ってしまうため必須）
  it('developer=PocketPair（7本）の候補は引き続き採用される', async () => {
    const candidate = makeGame({ title: 'Palworld', normalizedTitle: 'palworld' });
    const finishedGame = {
      ...candidate,
      developer: 'PocketPair',
      developerGameCount: 7,
      coverImage: 'https://example.com/palworld.jpg',
      sourceUrls: { steam: 'https://store.steampowered.com/app/1623730' },
    };

    mockFinalize.mockResolvedValueOnce({ ok: true, game: finishedGame });

    const result = await vetIndieCandidate(candidate);
    expect(result).not.toBeNull();
    expect(result?.developer).toBe('PocketPair');
  });
});
