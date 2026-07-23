import { useState, useRef } from "react";

// ==============================================
// フェーズ定義：メイキットの面談5ステップ
// id：内部識別子、label：表示名、color：UIカラー
// ==============================================
const PHASES = [
  { id: "clarify",  label: "① 言語化",   color: "#6366f1", desc: "やりたいことを具体化する" },
  { id: "design",   label: "② 設計",     color: "#0ea5e9", desc: "動くための準備をする" },
  { id: "revise",   label: "③ 修正",     color: "#f59e0b", desc: "フィードバックと次の動き" },
  { id: "execute",  label: "④ 実行",     color: "#10b981", desc: "やる・記録・振り返る" },
  { id: "redirect", label: "⑤ 方向修正", color: "#ef4444", desc: "再び行動に戻す" },
];

// ==============================================
// システムプロンプト：AIへの指示書
// メイキットの思想・フェーズ別ルール・出力形式を定義
// 配列で書いてjoinするのはテンプレートリテラルの
// 構文エラーを避けるため
// ==============================================
const SYSTEM_PROMPT = [
  "あなたはメイキット（Make it!）の挑戦サポートセッションにおける、メンター向けコパイロットAIです。",
  "サービス思想：勉強を教えるサービスではなく、行動を変えるサービス。",
  "中高生が自分の意志で始めたことを実現できるという経験と自信を得ることが目的。",
  "メンターは答えを教える教師でも相談相手でもなく、興味→目標→プロジェクト→タスクへ具体化する支援者。",
  "4つの階層：興味→目標→プロジェクト→タスク。",
  "【①言語化】目的：やりたいことを具体化。注意：深掘りで手が止まるのを防ぐ。Whyは仮でOK。",
  "【②設計】目的：明日やることが1つ決まっている状態。注意：比較は3案まで・完璧禁止。",
  "【③修正】目的：次の1アクションが明確。注意：評価しない・褒めすぎない。",
  "【④実行】目的：実行→記録→振り返りのサイクル。注意：振り返りを必須に。",
  "【⑤方向修正】目的：次の1アクションが決まっている状態に戻す。注意：否定せずスモールステップに。",
  "メンターが入力したフェーズと生徒の状況をもとに、以下のJSON形式のみで返してください。マークダウン不要。",
  // AIに返してほしいJSONの型定義
  '{"detectedPhase":"clarify/design/revise/execute/redirectのいずれか","phaseReason":"判断理由1文","questions":[{"text":"声かけ","purpose":"理由15字以内","risk":"注意点またはnull"},{"text":"声かけ","purpose":"理由15字以内","risk":null},{"text":"声かけ","purpose":"理由15字以内","risk":null}],"alert":"注意点またはnull","nextPhase":"次フェーズIDまたはnull"}',
].join("\n");

export default function MentorCopilot() {
  // ==============================================
  // 状態管理
  // ==============================================
  const [phase, setPhase] = useState("clarify");       // 選択中のフェーズ
  const [situation, setSituation] = useState("");       // メンターの入力テキスト
  const [loading, setLoading] = useState(false);        // API通信中フラグ
  const [result, setResult] = useState(null);           // AIの返答（パース済みJSON）
  const [error, setError] = useState(null);             // エラーメッセージ
  const [history, setHistory] = useState([]);           // 会話履歴（セッション中の記憶）
  const resultRef = useRef(null);                       // 結果欄へのスクロール用

  const currentPhase = PHASES.find(p => p.id === phase);

  // ==============================================
  // AIへのリクエスト処理
  // ==============================================
  async function handleSubmit() {
    if (!situation.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // フェーズ情報と生徒の状況をまとめてAIに送る
    const userMessage = "現在のフェーズ：" + currentPhase.label + "（" + currentPhase.desc + "）\n\n生徒の状況・発言：\n" + situation;

    try {
      // 直接Anthropic APIは叩かず、自前のAPIルート経由でリクエスト
      // → APIキーをフロントに露出させないため
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [...history, { role: "user", content: userMessage }],
        }),
      });

      const data = await response.json();
      // content配列からテキストを結合
      const text = data.content?.map(i => i.text || "").join("") || "";
      // AIがマークダウンで返してきた場合の除去
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      setResult(parsed);

      // 会話履歴に追加（次回リクエスト時に渡してセッション記憶を維持）
      setHistory(prev => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: text }
      ]);

      // 結果欄までスクロール
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError("AIの応答を取得できませんでした。もう一度試してください。");
    } finally {
      setLoading(false);
    }
  }

  // セッションを最初の状態に戻す
  function handleReset() {
    setSituation("");
    setResult(null);
    setError(null);
    setHistory([]); // 会話履歴もリセット→AIの記憶が消える
    setPhase("clarify");
  }

  // AIが返したフェーズIDからフェーズオブジェクトを取得
  const detectedPhaseObj = result ? PHASES.find(p => p.id === result.detectedPhase) : null;
  const nextPhaseObj = result?.nextPhase ? PHASES.find(p => p.id === result.nextPhase) : null;

  // ==============================================
  // UI
  // ==============================================
  return (
    <div style={{ fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", minHeight: "100vh", background: "#0f0f13", color: "#e8e8f0", paddingBottom: 60 }}>

      {/* ヘッダー */}
      <div style={{ borderBottom: "1px solid #1e1e2e", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f0f13", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", boxShadow: "0 0 8px #6366f1" }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.05em", color: "#c4c4d4" }}>Make it! メンターコパイロット</span>
        </div>
        <button onClick={handleReset} style={{ background: "transparent", border: "1px solid #2e2e42", color: "#666", fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer" }}>リセット</button>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px 0" }}>

        {/* フェーズ選択ボタン */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 10 }}>現在のフェーズ</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PHASES.map(p => (
              <button key={p.id} onClick={() => { setPhase(p.id); setResult(null); }} style={{ padding: "7px 14px", borderRadius: 8, border: phase === p.id ? "1.5px solid " + p.color : "1.5px solid #1e1e2e", background: phase === p.id ? p.color + "18" : "transparent", color: phase === p.id ? p.color : "#555", fontSize: 13, fontWeight: phase === p.id ? 600 : 400, cursor: "pointer" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: currentPhase.color, marginTop: 8, opacity: 0.8 }}>{currentPhase.desc}</div>
        </div>

        {/* 状況入力 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 8 }}>生徒の状況・発言</div>
          <textarea value={situation} onChange={e => setSituation(e.target.value)} placeholder="例：起業したいとは言ってるけど、何をやりたいか全然決まってない。服が好きとだけ言ってた。" style={{ width: "100%", minHeight: 110, background: "#15151f", border: "1px solid #1e1e2e", borderRadius: 10, color: "#e8e8f0", fontSize: 14, padding: "14px 16px", resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>

        {/* 送信ボタン */}
        <button onClick={handleSubmit} disabled={loading || !situation.trim()} style={{ width: "100%", padding: "13px", background: loading || !situation.trim() ? "#1e1e2e" : "#6366f1", color: loading || !situation.trim() ? "#444" : "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: loading || !situation.trim() ? "not-allowed" : "pointer" }}>
          {loading ? "AI が考え中..." : "次の声かけを生成"}
        </button>

        {/* エラー表示 */}
        {error && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#2a1010", border: "1px solid #5a2020", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>
        )}

        {/* 結果表示 */}
        {result && (
          <div ref={resultRef} style={{ marginTop: 28 }}>

            {/* フェーズ自動判定（選択と異なる場合のみ表示） */}
            {detectedPhaseObj && result.detectedPhase !== phase && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: detectedPhaseObj.color + "12", border: "1px solid " + detectedPhaseObj.color + "40", borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: detectedPhaseObj.color, fontWeight: 600 }}>AIの判定：{detectedPhaseObj.label}</span>
                <span style={{ color: "#666", marginLeft: 8 }}>{result.phaseReason}</span>
              </div>
            )}

            {/* アラート（見落としがちな観察ポイント） */}
            {result.alert && result.alert !== "null" && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "#1a1510", border: "1px solid #78350f", borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.6 }}>{result.alert}</span>
              </div>
            )}

            {/*
