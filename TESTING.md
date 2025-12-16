# Pedaru テストガイド

このドキュメントではPedaruのテスト戦略と実行方法を説明します。

## テストの種類

### 1. バックエンド（Rust）テスト

PDFパース、エンコーディング検出などのロジックをテストします。

**実行方法:**
```bash
cd src-tauri
cargo test --verbose
```

**カバレッジ確認:**
```bash
cargo tarpaulin --out Html
```

### 2. フロントエンド（TypeScript）ユニットテスト

タブ管理などのビジネスロジックをテストします。

**依存関係のインストール:**
```bash
npm install
```

**テスト実行:**
```bash
# 全テストを実行
npm test

# ウォッチモード（開発中に便利）
npm test -- --watch

# UI付きでテストを実行
npm run test:ui

# カバレッジレポート生成
npm run test:coverage
```

**テストファイルの配置:**
- テスト対象: `src/lib/*.ts`
- テストファイル: `src/lib/*.test.ts`

### 3. 型チェック

TypeScriptの型エラーをチェックします。

```bash
npx tsc --noEmit
```

### 4. Linting

コードスタイルとベストプラクティスをチェックします。

**Rust:**
```bash
cd src-tauri
cargo clippy -- -D warnings
cargo fmt -- --check
```

### 5. 手動テスト

自動化が難しい機能は手動でテストします。

- [タブ機能のテストチェックリスト](./TESTING_TABS.md)
- リリース前に必ず全項目を確認してください

## CI/CD

GitHub Actionsで自動的に以下をチェックします:

```yaml
✓ Rust Tests (Ubuntu)
✓ Rust Clippy (Ubuntu)
✓ Rust Format Check (Ubuntu)
✓ TypeScript Type Check (Ubuntu)
✓ Frontend Build (Ubuntu)
✓ Tauri Build (macOS, Ubuntu, Windows)
```

プルリクエストを作成すると自動実行されます。

## テストの書き方

### フロントエンドのユニットテスト

純粋関数として実装したロジックをテストします:

```typescript
// src/lib/myLogic.ts
export function calculateSomething(input: number): number {
  return input * 2;
}

// src/lib/myLogic.test.ts
import { describe, it, expect } from 'vitest';
import { calculateSomething } from './myLogic';

describe('calculateSomething', () => {
  it('should double the input', () => {
    expect(calculateSomething(5)).toBe(10);
  });
});
```

### タブ管理のテスト例

`src/lib/tabManager.test.ts`を参考にしてください:

```typescript
describe('addTab', () => {
  it('should add a new tab and make it active', () => {
    const state = { tabs: [], activeTabId: null };
    const newTab = createMockTab('tab-1', 'test.pdf');

    const result = addTab(state, newTab);

    expect(result.tabs).toHaveLength(1);
    expect(result.activeTabId).toBe('tab-1');
  });
});
```

## ベストプラクティス

### 1. ロジックを分離する

- UI層とビジネスロジックを分離
- 純粋関数として実装できる部分はファイルを分ける
- `page.tsx`から`lib/`にロジックを移動

### 2. テストしやすい設計

**悪い例（テストしにくい）:**
```typescript
function MyComponent() {
  const [state, setState] = useState(0);

  const complexLogic = () => {
    // 複雑なロジックがコンポーネント内に
    const result = /* 100行のロジック */;
    setState(result);
  };
}
```

**良い例（テストしやすい）:**
```typescript
// lib/myLogic.ts
export function complexCalculation(input: Data): Result {
  // 純粋関数として実装
  return /* ロジック */;
}

// Component.tsx
function MyComponent() {
  const [state, setState] = useState(0);

  const complexLogic = () => {
    const result = complexCalculation(data);
    setState(result);
  };
}

// lib/myLogic.test.ts
test('complexCalculation works correctly', () => {
  expect(complexCalculation(input)).toEqual(expected);
});
```

### 3. エッジケースをテスト

- 空配列、null、undefined
- 境界値（0, -1, 最大値）
- 想定外の順序での操作

### 4. テストの粒度

- **小さく:** 1つのテストは1つの振る舞いをチェック
- **明確に:** テスト名から何をテストしているか分かる
- **独立:** テスト同士が依存しない

## トラブルシューティング

### テストが失敗する

1. `npm install`を実行して依存関係を更新
2. `npm run build`が通るか確認
3. エラーメッセージを読んで該当コードを確認

### 型エラーが出る

```bash
npx tsc --noEmit
```

で詳細なエラー箇所を確認できます。

### Tauriアプリが起動しない

```bash
# キャッシュをクリア
cd src-tauri
cargo clean

# 再ビルド
cd ..
npm run tauri dev
```

## 今後の拡張

現在は基本的なユニットテストのみですが、以下を追加できます:

- [ ] E2Eテスト（Playwright）
- [ ] ビジュアルリグレッションテスト
- [ ] パフォーマンステスト
- [ ] アクセシビリティテスト

コントリビューション歓迎です！
