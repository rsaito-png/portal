# 電子サイン設計案（労働契約書・秘密情報の保持に関する誓約書）
状態: 設計案のみ。本番DB・コードは未変更、コミット/pushなし。個人データはこのファイルに書かない（リポジトリは公開）。

## 0. 方針
- PDFは保管の主役にしない。内容をDBに構造化保存し、職員がログイン状態で画面確認→氏名入力で「同意して署名」。
- 記録 = 誰が・いつ・どの版の文面に同意したか + 同意時点の文面のSHA-256。
- 事務画面に職員別一覧。職員を選ぶと全文+同意記録が1枚で出て、印刷/PDF出力（ブラウザの印刷）できる。
- 契約書本体に入れないもの: マイナンバー、振込先口座、生年月日、住所。現行の雛形にある欄だが、別管理（給与・社保の台帳側）にし、契約書は「氏名・職員ID」だけで特定する。住所は誓約書にも欄があるが、本文に不要なので省く案。
- 氏名表記: 使用者側は「代表理事 齊藤連」（config.jsで持つ）。

## 1. 雛形から読み取った項目（阪井さんの契約書・誓約書より）
契約締結日 / 雇用期間(有期は開始〜終了) / 試用期間 / 就業場所 / 仕事内容 / 就業時間 / 所定時間外・休日労働の有無 / 休日 / 休暇 / 退職(定年・その他は就業規則) / 賃金(基本給と単位[時給/月給]・交通費) / 割増率(時間外法定内・法定超、休日法定・法定外、深夜25%) / 締切・支払日・支払方法 / 賞与 / 昇給 / 退職金 / 社会保険・雇用保険 / 備考。
注意: 阪井さんの例は割増率の空欄(％)がある。項目化で「未設定」を許すか、必須にするか要決定（未決事項2）。

### 事業所・雇用形態で変わる部分
| 項目 | 変わる要因 |
|---|---|
| 就業場所・仕事内容 | 事業所（梁山泊=世話人 等） |
| 就業時間・休日 | 雇用形態（シフト制/固定）・事業所 |
| 賃金・単位 | 雇用形態（時給/月給）、個人 |
| 雇用期間・試用 | 有期/無期、入職時期 |
| 社保・雇用保険 | 勤務時間による加入状況（個人） |
| 賞与・昇給・退職金・割増率・支払日・退職条項 | ほぼ法人共通（config.jsで既定値） |
→ 共通部分は法人の既定値(config.js)、事業所・雇用形態の違いはテンプレート種別、個人差は契約ごとの値、の3層。

## 2. テーブル設計とRLS案（SQL案。supabase/esign.sql として将来作る）
前提: 既存の staff_profiles(user_id, office, role) と my_role()/my_office() を使う。notify_enqueue を使う。

```sql
create extension if not exists pgcrypto;

-- 職員の氏名(契約書に出す名前)。staff_profiles に追加（未追加の場合）
alter table public.staff_profiles add column if not exists full_name text;

-- ① 文面テンプレート（版管理）。本文は {{項目}} 入りのテキスト。公開リポジトリには個人情報なしの雛形だけ
create table public.doc_templates (
  id bigint generated always as identity primary key,
  doc_type text not null check (doc_type in ('labor_contract','confidentiality')),
  variant text not null default 'standard',      -- 例 standard / 時給シフト制 / 月給 など
  version int not null,
  body text not null,                            -- 文面（変数は {{wage}} のように入る）
  effective_from date not null,
  retired_at date,
  created_at timestamptz not null default now(),
  unique (doc_type, variant, version)
);

-- ② 文書（職員ごと・契約ごと）。契約項目は terms(jsonb) に構造化して保存
create table public.staff_docs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  doc_type text not null check (doc_type in ('labor_contract','confidentiality')),
  template_id bigint not null references public.doc_templates(id),
  terms jsonb not null default '{}',   -- 契約項目。機微情報は入れない（CHECKで禁止キー）
  period_start date, period_end date,  -- 有期の雇用期間（更新管理・期限通知に使う）
  prev_doc_id bigint references public.staff_docs(id),  -- 更新前の契約
  status text not null default 'draft' check (status in ('draft','issued','signed','superseded','void')),
  rendered_text text,                  -- 発行時に確定した全文（変数を埋めたもの）。署名対象はこれ
  issued_by uuid, issued_at timestamptz,
  created_at timestamptz not null default now(),
  constraint terms_no_sensitive check (not (terms ?| array['my_number','mynumber','bank','bank_account','birth','address']))
);
create index on public.staff_docs (user_id, doc_type, status);
create index on public.staff_docs (period_end) where status = 'signed';

-- ③ 署名記録（追記専用。更新・削除不可）
create table public.doc_signatures (
  id bigint generated always as identity primary key,
  doc_id bigint not null unique references public.staff_docs(id),  -- 1文書につき1署名
  user_id uuid not null,
  typed_name text not null,            -- 入力された氏名
  text_sha256 text not null,           -- rendered_text のSHA-256（DB側で計算）
  template_version int not null,
  signed_at timestamptz not null default now(),
  user_agent text                      -- 任意。IPはEdge Function経由でないと取れないので初期は持たない
);

-- ④ 監査ログ（発行・閲覧・取消）
create table public.doc_events (
  id bigint generated always as identity primary key,
  doc_id bigint references public.staff_docs(id), actor uuid,
  event text not null, at timestamptz not null default now(), note text);

alter table public.doc_templates enable row level security;
alter table public.staff_docs enable row level security;
alter table public.doc_signatures enable row level security;
alter table public.doc_events enable row level security;

-- 読む: テンプレートは全員 / 文書・署名は本人(発行済み以降)か事務
create policy tpl_read on public.doc_templates for select to authenticated using (true);
create policy doc_read on public.staff_docs for select to authenticated
  using (public.my_role() = '事務' or (user_id = auth.uid() and status in ('issued','signed','superseded')));
create policy sig_read on public.doc_signatures for select to authenticated
  using (public.my_role() = '事務' or user_id = auth.uid());
create policy ev_read on public.doc_events for select to authenticated using (public.my_role() = '事務');
-- 書く: 画面から直接は書かせない。テンプレート・文書の作成は事務のみ、署名は関数だけ
create policy tpl_write on public.doc_templates for insert to authenticated with check (public.my_role() = '事務');
create policy doc_ins on public.staff_docs for insert to authenticated with check (public.my_role() = '事務' and status = 'draft');
create policy doc_upd on public.staff_docs for update to authenticated using (public.my_role() = '事務' and status = 'draft');
revoke insert, update, delete on public.doc_signatures, public.doc_events from authenticated;
revoke delete on public.staff_docs, public.doc_templates from authenticated;

-- 署名後は文面を変えられない（事務でも）。署名テーブルは更新・削除不可
create or replace function public.trg_docs_lock() returns trigger language plpgsql as $$
begin
  if old.status in ('signed','superseded') and (new.rendered_text is distinct from old.rendered_text
     or new.terms is distinct from old.terms or new.user_id <> old.user_id) then
    raise exception '署名済みの文書は変更できません。新しい版を作ってください';
  end if; return new; end $$;
create trigger docs_lock before update on public.staff_docs for each row execute function public.trg_docs_lock();
create or replace function public.trg_sig_immutable() returns trigger language plpgsql as $$
begin raise exception '署名記録は変更できません'; end $$;
create trigger sig_immutable before update or delete on public.doc_signatures for each row execute function public.trg_sig_immutable();

-- 発行（事務）: 変数を埋めて全文を確定し、本人へ通知
create or replace function public.doc_issue(p_doc bigint) returns void language plpgsql security definer set search_path = public as $$
declare d staff_docs; t doc_templates; txt text; k text; v text; nm text;
begin
  if public.my_role() <> '事務' then raise exception '事務のみ'; end if;
  select * into d from staff_docs where id = p_doc and status = 'draft'; if not found then raise exception '下書きがありません'; end if;
  select * into t from doc_templates where id = d.template_id;
  select full_name into nm from staff_profiles where user_id = d.user_id;
  txt := replace(t.body, '{{name}}', coalesce(nm, ''));
  for k, v in select key, value from jsonb_each_text(d.terms) loop txt := replace(txt, '{{' || k || '}}', v); end loop;
  update staff_docs set rendered_text = txt, status = 'issued', issued_by = auth.uid(), issued_at = now() where id = p_doc;
  insert into doc_events(doc_id, actor, event) values (p_doc, auth.uid(), 'issued');
  perform notify_enqueue('all', '署名依頼', '✍️ 確認・署名をお願いする書類があります。ポータルの「書類の確認と署名」を開いてください。',
    'https://rsaito-png.github.io/portal/#sign', (select office from staff_profiles where user_id = d.user_id));
end $$;
-- 注: audience 'all' は事業所全員になる。本人だけに送るには notify_queue に audience='self' と対象user を足す改修が要る（未決/要確認）

-- 署名（本人）: 氏名が登録名と一致するか確認し、DB側でハッシュを計算して記録
create or replace function public.doc_sign(p_doc bigint, p_typed_name text) returns void language plpgsql security definer set search_path = public as $$
declare d staff_docs; t doc_templates; nm text;
begin
  select * into d from staff_docs where id = p_doc and user_id = auth.uid() and status = 'issued';
  if not found then raise exception '署名できる書類がありません'; end if;
  select full_name into nm from staff_profiles where user_id = auth.uid();
  if regexp_replace(p_typed_name, '[\s　]', '', 'g') <> regexp_replace(coalesce(nm,''), '[\s　]', '', 'g') then raise exception '氏名が登録と一致しません'; end if;
  select * into t from doc_templates where id = d.template_id;
  insert into doc_signatures(doc_id, user_id, typed_name, text_sha256, template_version)
    values (p_doc, auth.uid(), p_typed_name, encode(digest(d.rendered_text, 'sha256'), 'hex'), t.version);
  -- 同じ種類の前の署名済み文書は「置き換え済み」にする（更新契約）
  update staff_docs set status = 'superseded' where id = d.prev_doc_id and status = 'signed';
  update staff_docs set status = 'signed' where id = p_doc;
  insert into doc_events(doc_id, actor, event) values (p_doc, auth.uid(), 'signed');
  perform notify_enqueue('mgr', '署名完了', '✅ 書類への署名が届きました（' || nm || '）。', 'https://rsaito-png.github.io/portal/#clerk/docs',
    (select office from staff_profiles where user_id = auth.uid()));
end $$;
revoke all on function public.doc_issue(bigint), public.doc_sign(bigint, text) from public, anon;
grant execute on function public.doc_issue(bigint), public.doc_sign(bigint, text) to authenticated;

-- 運営指導用の一覧（事務のみ）
create or replace view public.v_doc_overview with (security_invoker = true) as
select p.user_id, p.full_name, p.office,
  (select max(s.signed_at) from staff_docs d join doc_signatures s on s.doc_id = d.id where d.user_id = p.user_id and d.doc_type = 'labor_contract' and d.status = 'signed') as contract_signed_at,
  (select max(d.period_end) from staff_docs d where d.user_id = p.user_id and d.doc_type = 'labor_contract' and d.status = 'signed') as contract_end,
  (select max(s.signed_at) from staff_docs d join doc_signatures s on s.doc_id = d.id where d.user_id = p.user_id and d.doc_type = 'confidentiality' and d.status = 'signed') as pledge_signed_at
from staff_profiles p;
-- security_invoker のため staff_profiles のRLSが効く。事務が全員見えるよう staff_profiles に事務用select方針を追加する必要あり（現状は本人のみ）
```
補足
- ハッシュはDB関数内で計算し、ブラウザの申告を信用しない。画面では「文面の指紋（先頭12桁）」を表示し、事務画面で rendered_text から再計算して一致を確認できる。
- 認証は「ログイン済み本人 + 登録氏名の入力一致」。手書きサインや署名時IPは初期は持たない。
- 誓約書はテンプレートのみ（変数は {{name}} と日付程度）。契約書と同じ仕組みで doc_type が違うだけ。

## 3. 画面案（既存の index.html のタイル+ハッシュ遷移、uketsuke.js の流儀。新規ファイル esign.js）
### 職員: #sign「書類の確認と署名」
1. 一覧: 未署名の書類（契約書/誓約書）と署名済み。未署名があるとトップにバッジ。
2. 書類画面: 全文を画面表示（契約項目は表形式、雛形の見た目に近づける）。最後までスクロールするとチェック「内容を読みました」が有効に。
3. 氏名欄に自分の氏名を入力 →「同意して署名」ボタン（確認ダイアログ付き）。
4. 完了表示: 署名日時・版・文面の指紋。自分の署名済み書類はいつでも再表示・印刷できる。
### 事務: #clerk/docs「書類管理」
1. 職員別一覧（v_doc_overview）: 氏名／事業所／契約書（署名日・契約終了日・版）／誓約書（署名日）／未署名は赤。絞り込み: 未署名のみ・期限90日以内。
2. 職員を選ぶ → 1枚の画面: 契約書全文＋誓約書全文＋署名記録（署名者・日時・版・SHA-256、再計算チェック「一致」）。「印刷/PDF」ボタンは window.print() と @media print のCSSで、1職員1ファイル。全員分まとめ出力は後回し。
3. 新規作成: 職員・テンプレート種別・契約項目を入力 → 下書き → プレビュー → 「発行」（doc_issue）。
4. 更新: 既存契約の「更新して作る」で前回の値が入った新しい下書きが開く。

## 4. 版管理と更新
- 文面の版: doc_templates の version。文面を変えるときは新しい版を追加、古いものは retired_at を入れる。署名済み書類は発行時の全文(rendered_text)を持つので、後でテンプレートが変わっても当時の文面が残る。
- 契約の変更（賃金変更など）: 既存を直さず新しい staff_docs を作り、prev_doc_id でつなぐ。本人署名で旧契約は superseded。旧契約も履歴として一覧に残る。
- 期間満了の更新: period_end の90日前・30日前に事務へ通知（毎日実行するSQL/cronで notify_enqueue 'mgr'）。事務が「更新して作る」→新しい期間で発行→本人署名。署名が間に合わない場合は一覧で赤表示。
- 誓約書: 入職時に1回。文面の版が上がったときだけ再署名を依頼（全員に新版を発行）。
- 書き間違い: status='void' にして理由を doc_events に残す（署名済みは消さない）。

## 5. 他法人展開（config.js側）
追加する設定案:
```js
esign: {
  enabled: true,
  employer: { orgName: '一般社団法人 心理社会的リハビリテーション・星心会', address: '三重県四日市市山城町59-4', title: '代表理事', name: '齊藤連' },
  docTypes: { labor_contract: '労働条件通知書兼雇用契約書', confidentiality: '秘密情報の保持に関する誓約書' },
  offices: { /* 事業所ごとの就業場所・仕事内容の既定値、例 梁山泊: {place:'梁山泊', job:'世話人'} */ },
  defaults: { probation: 'なし', bonus: '無', raise: '無', retirementPay: '無', payClose: '末日締切', payDay: '翌月15日', payMethod: '銀行振込', nightRate: 25, retire: '定年なし。その他の退職・解雇は就業規則による' },
  renewalNoticeDays: [90, 30],
  sensitiveKeysBlocked: ['マイナンバー','口座','生年月日','住所']
}
```
- 文面（テンプレート）は法人ごとにDBへ登録するので、コードの変更は不要。SQLは法人ごとのSupabaseに同じものを流す。
- 事業所名・雇用形態の種類は config.js の offices から取る。

## 6. 最初に作る最小範囲
1. esign.sql（上の4テーブル+doc_issue/doc_sign+一覧ビュー）を、本番ではなく先にテスト用データで確認。
2. テンプレート2種（標準の契約書=時給シフト制、誓約書）を登録。
3. 職員画面（一覧・全文・氏名入力で署名）。
4. 事務画面（職員別一覧・1職員1枚表示・印刷）。発行は最初はSQLエディタ/簡易フォームで可。
5. まず1〜2名（齊藤さん+1名）で試し、既存の署名済み紙契約は「紙で締結済み」として取り込むか判断。
後回し: 期間満了通知、更新ボタン、一括印刷、手書きサイン、署名時IP。

## 7. 未決事項（3つ）
1. 既に紙で締結済みの契約書・誓約書(約10名分)の扱い: ポータルで改めて全員署名し直すか、紙を「締結済み」として登録(スキャン添付のみ)するか。
2. 割増率など空欄の項目の扱い: 阪井さんの例は法定内・法定超・休日の％が空欄。法人の既定値を決めて必ず埋めるか、「就業規則による」とするか。
3. 通知の宛先: 署名依頼は本人だけにDMしたい。現行 notify_queue は事業所全員か管理者のみなので、「本人宛」の宛先を追加する改修をしてよいか（しない場合は全員通知か、通知なしで職員が画面で確認）。

## 8. 要確認（実装前に現物確認が必要）
- my_role() の定義（RLSで使用）が本番にあるか。uketsuke.sql は使っているが、定義ファイルはこのリポジトリで未確認。
- staff_profiles は今「本人のみ select」。事務が全員を見るポリシー追加と full_name 列の用意が必要。
- 法的には電子署名(同意の記録)で足りる運用が一般的だが、労働条件の明示は書面/電子交付に本人の希望が要る(労基法施行規則5条)。入職時に電子交付の同意を取る一文を契約画面に入れる案。


---
## 9. 決定事項と本番の確認結果（2026-10-15 追記）
### 齊藤さんの決定
1. 紙で締結済みの約10名分は、署名し直さず「紙で締結済み」として登録（署名なし、締結日と備考のみ）。事務画面の職員詳細に登録欄、DB関数 `doc_register_paper`。
2. 割増賃金率の既定値は「就業規則による」（config.js の `esign.defaults.premium`）。
3. 署名依頼は本人宛通知。`notify_queue` に `audience='self'` と `target_user` を追加、`notify_enqueue_self()` を新設。

### 8章の確認結果（service_role の読み取りで確認。Management API は database_read 権限が無く不可）
- `my_role()` `my_office()` `my_duty()` `can_manage()` `notify_enqueue()` は本番にある。
- `staff_profiles` の列: user_id, office, role, nikki_name, chat_email, chat_user, duty, chat_dm_space。**full_name は無い**→ esign.sql で追加し、登録時の名前(auth の name)から入れる。
- `staff_profiles` のRLSは本人のみ読める（sp_self）。事務が全員を読める方針(sp_clerk)を追加（JWTの役割を見る形）。職員は現在6名（事務1・職員5）。
- `notify_queue` の列に target_user は無かった→追加。audience のチェックに 'self' を追加。
- ハッシュは pgcrypto 不要の標準 `sha256()` を使用。

### 実装物
- `supabase/esign.sql`（貼って1回Run。何度流しても壊れない。構文は解析ツールで確認済み、DBでの実行は未）
- `esign.js`（職員 #sign／事務 #clerk/docs）、`config.js` の `esign` ブロックと2つのタイル、`index.html` の組み込み
### 残課題
- 本人宛通知の**送信側**は未実装。notify-chat 関数は mgr/all だけ送る。'self' の行は待ち行列に残るだけ（誤送信なし）。本人へのChat DM送信は Chatアプリ認証が要る。当面は、トップの「署名待ち」バッジで気づく。
- 期間満了通知 `doc_renewal_notices()` は毎日実行の登録(pg_cron)が任意。通知は既存の待ち行列経由＝夜間(22〜6時)は送らない規則のまま。
- 職員の full_name が auth の name と違う/空の人は署名できない（一致チェックのため）。実行後に確認が必要。
