# Codex 初期プロンプト — Phase 1 / MVP

あなたはこのリポジトリの実装担当です。
添付/配置されている改修済みFlowSpecを正式仕様の起点として読み、**Phase 1 / MVPだけを、起動可能・テスト可能・中断再開可能な状態まで完成**させてください。

## 最優先ルール

最初から全機能を実装しないでください。
今回の完成対象はPhase 1だけです。

Phase 1の本線は次です。

`Project作成 -> Preflight -> PNG/JPG/PDF入力 -> 図面解析 -> Human Review -> map_structure.json -> Blender Blockout MAP -> Deterministic Validation -> Unity Export -> Unity Import Validation -> 保存`

Phase 2のWeb画像検索、画像生成、3D Asset生成、Asset自動配置は実装しません。
Phase 3の高度なAI自動修正、Upper AI Escalation、Performance Optimizationも実装しません。
ただし、後から追加できるProvider interface / stub / extension pointは用意してください。

## 最初に読むファイル

必ず以下を読んでからコード変更を開始してください。

- `flow.json`
- `project.md`
- `requirements.md`
- `schemas/map_structure.schema.json`
- リポジトリに `AGENTS.md`、README、既存設計資料がある場合はそれら

FlowSpecと既存リポジトリが衝突する場合は、既存コードを壊さず差分を整理してください。
仕様を勝手に補完して正式決定せず、実装を止めるほど重要な未確定だけ `requires_human_decision` として記録してください。

## 技術スタック

既存リポジトリに技術スタックがある場合はそれを優先してください。
完全新規/空に近い場合は、MVPの既定として以下を使用してください。

- Python 3.12+
- PySide6: デスクトップUI
- Pydantic v2: Project/Job/Validation等のモデル
- jsonschema: `map_structure.json` validation
- Pillow: PNG/JPG metadata
- PyMuPDF: PDFページ/サイズ/metadata/raster preview
- pytest: Unit / State Machine / Adapter test
- 標準logging + JSONLログ

OCRはProvider化してください。OCRエンジンの大型追加インストールを必須にしないでください。
OllamaもProvider経由とし、利用不可でも入力解析の決定論的部分とHuman Reviewまでは進められる設計にしてください。

## 必須アーキテクチャ

業務ロジックから外部ツールを直接呼ばないでください。
最低限次のinterfaceを作ってください。

- `LLMProvider`
- `BlenderProvider`
- `AssetGenerationProvider` — Phase 1はUnavailable Stubでよい
- `ImageSearchProvider` — Phase 1はUnavailable Stubでよい
- `UpperAIProvider` — Phase 1はUnavailable Stubでよい
- `UnityProvider`

各Providerは最低限、Capability確認とUnavailableの構造化返却を持たせてください。
例外でPipeline全体を落とさず、`available=false / reason / version / details` のような結果を返してください。

テスト用に `FakeBlenderProvider` と `FakeUnityProvider` を必ず実装し、Blender/Unity未導入環境でもPhase 1のState Machineを最後までテストできるようにしてください。

## Project Workspace

1 MAP = 1 Projectです。

```text
projects/project_xxx/
  project.json
  source/
  analysis/
  structure/
  blender/
  assets/
  renders/
  unity/
  validation/
  logs/
  checkpoints/
```

元入力ファイルは変更禁止です。
`source/` にコピー後、派生物は別フォルダへ保存してください。

Project設定には最低限以下を保持してください。

- project id / name
- Unity Version
- Unity Project Path
- Provider設定
- `default_max_retry`（default=3）
- validation tolerance
- `human_review_confidence_threshold`
- Performance Profile（default=`Prototype`）
- Unity export format（MVP defaultはFBX、Adapter設定で変更可能にする）

## Preflight

Project開始時に以下を検出し、JSONで保存してください。

- Ollama接続
- 利用可能ローカルLLM
- Blender実行ファイル / Version
- Blender Adapter/MCPまたはCLI操作可否
- Unity実行ファイル / Version
- Unity Project Pathの存在/妥当性
- AssetGeneration Backend capability
- GPU / VRAM
- RAM
- Disk空き容量
- Internet接続
- Upper AI API利用可否

Optional Providerが無くても停止しないでください。
Blender/Unityが無い場合もProjectを破棄せず、該当工程まで進んだ時点で `WAITING_USER / requires_human_decision` にしてください。

## 入力

Phase 1必須対応:

- PNG
- JPG / JPEG
- PDF

PDFは複数ページ必須です。
入力時に可能な範囲で以下を取得してください。

- file integrity
- MIME / extension
- page count
- resolution
- DPI
- physical page/drawing size
- scale notation候補
- dimension notation候補
- orientation/north候補
- legend候補
- OCR result

抽出結果には `source_reference` としてsource file、page、可能ならbboxを残してください。

## Provenance

情報は必ず次の3種類を区別してください。

- `CONFIRMED`
- `INFERRED`
- `GENERATED`

`CONFIRMED` は自動変更禁止です。
ローカルAI、修正処理、将来のUpper AIのどれも上書きできないようDomain層でGuardを実装してください。

自動処理がCONFIRMED変更を要求した場合は失敗として記録し、Human Reviewへ送ってください。

## map_structure.json

`schemas/map_structure.schema.json` を正として `structure/map_structure.json` を生成してください。
独自形式を別に作らないでください。

内部座標:

- meter
- 1 unit = 1 meter
- right-handed
- Z-up
- XY horizontal plane
- World Origin明示
- Rotation明示
- Scale明示

可能な値は `{value, source_type, confidence, source_reference}` を保持します。

Schema validationは保存前とBlender生成前に必ず行ってください。

## Human Review

重要項目:

- MAP全体縮尺
- 建物寸法
- 建物高さ
- 道路幅
- 地形高さ
- 方位
- 基準点

重要項目がINFERRED/GENERATEDの場合、またはConfidenceが閾値未満の場合は `WAITING_USER` にしてください。

UIで最低限:

- 承認
- 修正
- 再推定
- 未確定のまま続行

を選択可能にしてください。

ユーザー修正は履歴を残してuser-confirmedなCONFIRMEDとして反映してください。
未確定続行は `metadata.unresolved_items` に記録してください。

## Blender Blockout

Phase 1では高品質Assetを作らないでください。
`map_structure.json` から次を中心に生成してください。

- Terrain/ground
- Road blockout
- Building blockout
- ObjectsはPrimitive/Placeholder

Blender中心設計を維持します。
実Blender Providerは、可能ならBlender CLI/headless Pythonを第一候補にしてください。MCPが利用可能な場合でもProvider内部に隔離し、Domain層へMCP固有処理を漏らさないでください。

生成物例:

- `blender/map.blend`
- Validation用metadata JSON
- 必要なら `renders/` にpreview

## Deterministic Validator

AIより先に必ず通常コードで検証してください。
最低限:

- Object count
- Bounding Box
- Position差
- Scale差
- Rotation差
- Distance
- Road width
- Building dimensions
- MAP bounds
- Object overlap
- Missing object
- Duplicate object

ToleranceはProject設定から読みます。
Validation Resultには `expected / actual / tolerance / pass-fail / target_id / message` を保存してください。

Vision/LLM ValidationはPhase 1でinterfaceを残してもよいですが、必須にしないでください。
数値で判定できる項目をAIへ渡さないでください。

## Retry / State Machine

各Job状態:

- `PENDING`
- `RUNNING`
- `SUCCESS`
- `FAILED`
- `WAITING_USER`
- `SKIPPED`
- `CANCELLED`

成功工程ごとにCheckpointを作ってください。
Crash後に最後の正常CheckpointからResumeできることをテストしてください。

UI/Service APIとして最低限:

- Pause
- Resume
- Cancel
- Retry Step
- Run From Here

を持たせてください。

自動Retryの既定上限は3。
Phase 1で使う最低限のcounter:

- `local_fix`
- `map_final_fix`
- `unity_fix`

Phase 2/3用のcounter fieldは予約してよいですが処理自体は作り込まないでください。

Retry上限到達時は必ず `WAITING_USER / requires_human_decision`。
無限ループは禁止です。

ユーザー選択肢:

- Retry
- 設定変更
- 工程Skip
- 手動修正待ち
- Project停止

`Run From Here` は選択工程より後ろの依存成果物だけをinvalidateし、無関係な正常成果物を消さないでください。

## Unity Adapter

Unity処理は `UnityProvider` に完全隔離してください。

内部MAPはZ-up、UnityはY-upです。
座標変換はAI禁止です。
基準写像:

`(x, y, z)_map -> (x, z, y)_unity`

ただしFBX Export/Unity Importでhandedness、triangle winding、normal、rotationがどう扱われるかを実測/Unit Testで固定してください。

MVP export formatはFBXを既定にして構いませんが、Provider設定で交換可能にしてください。

Unity検証対象:

- Scale
- Axis
- Origin
- Pivot
- Material
- Texture
- Collider
- Mesh
- Normal
- UV
- Missing Reference
- Import Error

Unityが利用可能な環境ではbatchmode等でImport Validationを自動化してください。
利用不可環境ではFakeUnityProviderでEnd-to-End State Machine testを通してください。

ユーザーの既存Unity Projectを無断で破壊的変更しないでください。
生成Editor Script等が必要ならProject Workspace側に生成し、適用内容を明示してください。

## UI — Phase 1で実装する範囲

最初から豪華なUIを作らないでください。
動作優先です。

最低限:

1. Project一覧 / New Project
2. Project設定 / Preflight結果
3. 入力資料Preview（PDFページ切替）
4. 解析結果 / provenance表示
5. Human Review
6. Pipeline Progress
7. `map_structure.json` summary
8. Validation結果
9. Blender生成物/Previewへの導線
10. Unity Export状態
11. Logs

Pipeline画面では少なくとも `現在 / SUCCESS / FAILED / WAITING_USER / SKIPPED` が判別できるようにしてください。

## Phase 1で実装しないもの

次を本実装しないでください。

- Web画像検索
- 画像生成AI
- Tripo直接連携
- Hunyuan3D本連携
- 高品質3D Asset生成
- Asset品質の自動再生成ループ
- Upper AIへの実送信
- 高度な自律修正
- Performance Optimization
- 高度なLOD最適化

interface/stubだけで十分です。

## 推奨ディレクトリ構成

既存構成がなければ、例として以下を使用してください。

```text
src/map_pipeline/
  app.py
  domain/
    models.py
    provenance.py
    state_machine.py
  providers/
    base.py
    ollama.py
    blender.py
    unity.py
    stubs.py
    fakes.py
  services/
    project_service.py
    preflight.py
    input_service.py
    analysis_service.py
    structure_service.py
    checkpoint_service.py
    pipeline_service.py
  validators/
    deterministic.py
    schema_validator.py
    unity_validator.py
  ui/
    main_window.py
    project_view.py
    review_view.py
    pipeline_view.py
    validation_view.py
schemas/
  map_structure.schema.json
tests/
```

## テスト必須項目

最低限次をpytestで自動化してください。

1. `map_structure.schema.json` が有効なJSON Schemaである。
2. sample `map_structure.json` がSchemaを通る。
3. CONFIRMEDの自動変更が拒否される。
4. PNG/JPG/PDF入力がProject Workspaceへ非破壊で取り込まれる。
5. multi-page PDF metadataが保持される。
6. PreflightでUnavailable ProviderがPipeline全体例外にならない。
7. Human Review 4操作の状態遷移。
8. retry上限到達でWAITING_USERになる。
9. CheckpointからResumeできる。
10. Run From Hereで後続だけinvalidateされる。
11. FakeBlenderProviderでBlockout工程が完了する。
12. Deterministic ValidatorがMissing/Duplicate/position/scale/rotation/boundsを検出する。
13. Unity座標変換の既知値テスト。
14. FakeUnityProviderでImport Validation完了までEnd-to-Endで到達する。
15. Cancel/Pause/ResumeがState Machine上で破綻しない。

実Blender/実Unityがある場合のみIntegration Testを追加してください。
導入されていない外部ソフトをテストのためだけに勝手にインストールしないでください。

## 完成条件

Phase 1完了とみなす条件:

- アプリが起動する。
- New Projectから入力、解析、Human Review、map_structure生成までUIで進める。
- Blender BlockoutがProvider経由で生成できる。
- Deterministic Validation結果が保存/表示される。
- Unity Export/Import Validationへ進める。
- 実Providerがない環境でもFake ProviderでE2E testが通る。
- Pause/Resume/Checkpoint/Retry上限が動く。
- source fileを変更しない。
- CONFIRMEDを自動変更しない。
- Phase 2/3を勝手に実装していない。

## 作業手順

1. 既存リポジトリとFlowSpecを読んで現状を短く整理する。
2. Phase 1の実装計画をTODOとして作る。
3. Domain model / State Machine / Provider interface / Workspaceから先に実装する。
4. Fake ProviderでE2E経路を先に通す。
5. Input / Schema / Human Review / Validatorを実装する。
6. BlenderProviderを接続する。
7. UnityProviderを接続する。
8. 最小UIをつなぐ。
9. pytestを全実行する。
10. 実Blender/Unityが利用可能ならIntegration Testを実行する。
11. Phase 1以外へ手を広げず、結果を報告する。

## 最終報告形式

実装完了時に以下だけを明確に報告してください。

- Phase 1完成状況
- 起動方法
- Test結果
- 実Blender / Unityの検証結果
- Fake Providerのみで検証した箇所
- 追加/変更した主要ファイル
- 残っている `requires_human_decision`
- Phase 2へ回したTODO

**最優先は「まずPhase 1を起動可能・テスト可能な状態まで完成させる」ことです。**