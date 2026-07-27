import { useState, useRef } from "react";

// フェーズ定義：メイキットの面談5ステップ
// id：内部識別子、label：表示名、color：UIカラー
const PHASES = [
  { id: "clarify",  label: "① 言語化",   color: "#6366f1", desc: "やりたいことを具体化する" },
  { id: "design",   label: "② 設計",     color: "#0ea5e9", desc: "動くための準備をする" },
  { id: "revise",   label: "③ 修正",     color: "#f59e0b", desc: "フィードバックと次の動き" },
  { id: "execute",  label: "④ 実行",     color: "#10b981", desc: "やる・記録・振り返る" },
  { id: "redirect", label: "⑤ 方向修正", color: "#ef4444", desc: "再び行動に戻す" },
];

// システムプロンプト：AIへの指示書
// メイキットの思想・フェーズ別ルール・出力形式を定義
// 配列+joinはテンプレートリテラルの構文エラーを避けるため
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
  '{"detectedPhase":"clarify/design/revise/execute/redirectのいずれか","phaseReason":"判断理由1文","questions":[{"text":"声かけ","purpose":"理由15字以内","risk":"注意点またはnull"},{"text":"声かけ","purpose":"理由15字以内","risk":null},{"text":"声かけ","purpose":"理由15字以内","risk":null}],"alert":"注意点またはnull","nextPhase":"次フェーズIDまたはnull"}',
].join("\n");

// システムプロンプト：目標設定・タスク分解用
const GOAL_PROMPT = [
  "あなたはメイキット（Make it!）の挑戦サポートにおける目標設定・タスク分解の専門AIです。",
  "中高生の興味・現状をもとに、達成可能な短期目標を設定し、具体的なタスクに分解してください。",
  "原則：目標は1〜2ヶ月で達成できるサイズにする。タスクは今週できるレベルまで小さくする。完璧を求めない。",
  "4つの階層で考える：興味→目標→プロジェクト→タスク。",
  "以下のJSON形式のみで返してください。マークダウン不要。",
  '{"interest":"生徒の興味を一言で","goal":"1〜2ヶ月の短期目標","project":"目標を達成するためのプロジェクト名","tasks":[{"text":"今週やるタスク1","why":"なぜこのタスクか15字以内"},{"text":"タスク2","why":"理由15字以内"},{"text":"タスク3","why":"理由15字以内"}],"firstAction":"明日できる最初の1アクション","alert":"メンターへの注意点またはnull"}',
].join("\n");

export default function MentorCopilot() {
  // タブ管理（coaching: 声かけ生成 / goal: 目標・タスク分解）
  const [activeTab, setActiveTab] = useState("coaching");

  // 声かけ生成の状態
  const [phase, setPhase] = useState("clarify");
  const [situation, setSituation] = useState("");
  const [coachingResult, setCoachingResult] = useState(null);
  const [coachingHistory, setCoachingHistory] = useState([]);

  // 目標・タスク分解の状態
  const [goalInput, setGoalInput] = useState("");
  const [goalResult, setGoalResult] = useState(null);

  // 共通状態
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);

  const currentPhase = PHASES.find(p => p.id === phase);

  // APIリクエスト共通関数
  // 直接Anthropic APIは叩かず、/api/chat経由でAPIキーを隠す
  async function callAPI(system, messages) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages }),
    });
    const data = await response.json();
    const text = data.content?.map(i => i.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return { parsed: JSON.parse(clean), text };
  }

  // 声かけ生成の送信処理
  async function handleCoachingSubmit() {
    if (!situation.trim()) return;
    setLoading(true);
    setError(null);
    setCoachingResult(null);

    const userMessage = "現在のフェーズ：" + currentPhase.label + "（" + currentPhase.desc + "）\n\n生徒の状況・発言：\n" + situation;

    try {
      const { parsed, text } = await callAPI(SYSTEM_PROMPT, [...coachingHistory, { role: "user", content: userMessage }]);
      setCoachingResult(parsed);
      // 会話履歴に追加してセッション記憶を維持
      setCoachingHistory(prev => [...prev, { role: "user", content: userMessage }, { role: "assistant", content: text }]);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError("AIの応答を取得できませんでした。もう一度試してください。");
    } finally {
      setLoading(false);
    }
  }

  // 目標・タスク分解の送信処理
  async function handleGoalSubmit() {
    if (!goalInput.trim()) return;
    setLoading(true);
    setError(null);
    setGoalResult(null);

    try {
      const { parsed } = await callAPI(GOAL_PROMPT, [{ role: "user", content: "生徒の興味・現状：\n" + goalInput }]);
      setGoalResult(parsed);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError("AIの応答を取得できませんでした。もう一度試してください。");
    } finally {
      setLoading(false);
    }
  }

  // セッション全体をリセット
  function handleReset() {
    setSituation("");
    setCoachingResult(null);
    setCoachingHistory([]); // 会話履歴もリセット→AIの記憶が消える
    setPhase("clarify");
    setGoalInput("");
    setGoalResult(null);
    setError(null);
  }

  // AIが返したフェーズIDからフェーズオブジェクトを取得
  const detectedPhaseObj = coachingResult ? PHASES.find(p => p.id === coachingResult.detectedPhase) : null;
  const nextPhaseObj = coachingResult?.nextPhase ? PHASES.find(p => p.id === coachingResult.nextPhase) : null;

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

        {/* タブ切り替え */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#15151f", borderRadius: 10, padding: 4 }}>
          {[{ id: "coaching", label: "声かけ生成" }, { id: "goal", label: "目標・タスク分解" }].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setError(null); }} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: activeTab === tab.id ? "#6366f1" : "transparent", color: activeTab === tab.id ? "#fff" : "#555", fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, cursor: "pointer" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 声かけ生成タブ */}
        {activeTab === "coaching" && (
          <div>
            {/* フェーズ選択ボタン */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 10 }}>現在のフェーズ</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PHASES.map(p => (
                  <button key={p.id} onClick={() => { setPhase(p.id); setCoachingResult(null); }} style={{ padding: "7px 14px", borderRadius: 8, border: phase === p.id ? "1.5px solid " + p.color : "1.5px solid #1e1e2e", background: phase === p.id ? p.color + "18" : "transparent", color: phase === p.id ? p.color : "#555", fontSize: 13, fontWeight: phase === p.id ? 600 : 400, cursor: "pointer" }}>
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
            <button onClick={handleCoachingSubmit} disabled={loading || !situation.trim()} style={{ width: "100%", padding: "13px", background: loading || !situation.trim() ? "#1e1e2e" : "#6366f1", color: loading || !situation.trim() ? "#444" : "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: loading || !situation.trim() ? "not-allowed" : "pointer" }}>
              {loading ? "AI が考え中..." : "次の声かけを生成"}
            </button>

            {/* 声かけ結果 */}
            {coachingResult && (
              <div ref={resultRef} style={{ marginTop: 28 }}>
                {/* フェーズ自動判定（選択と異なる場合のみ表示） */}
                {detectedPhaseObj && coachingResult.detectedPhase !== phase && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", background: detectedPhaseObj.color + "12", border: "1px solid " + detectedPhaseObj.color + "40", borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: detectedPhaseObj.color, fontWeight: 600 }}>AIの判定：{detectedPhaseObj.label}</span>
                    <span style={{ color: "#666", marginLeft: 8 }}>{coachingResult.phaseReason}</span>
                  </div>
                )}

                {/* アラート（見落としがちな観察ポイント） */}
                {coachingResult.alert && coachingResult.alert !== "null" && (
                  <div style={{ marginBottom: 16, padding: "12px 16px", background: "#1a1510", border: "1px solid #78350f", borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.6 }}>{coachingResult.alert}</span>
                  </div>
                )}

                {/* 声かけ候補3つ */}
                <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 12 }}>声かけ候補</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {coachingResult.questions?.map((q, i) => (
                    <div key={i} style={{ background: "#15151f", border: i === 0 ? "1px solid #2e2e4a" : "1px solid #1e1e2e", borderRadius: 10, padding: "16px 18px", position: "relative" }}>
                      {/* 1番目だけ推奨バッジ */}
                      {i === 0 && <div style={{ position: "absolute", top: -1, left: 14, background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "0 0 6px 6px" }}>推奨</div>}
                      <div style={{ fontSize: 15, lineHeight: 1.7, color: "#e0e0f0", marginTop: i === 0 ? 8 : 0, marginBottom: 10 }}>「{q.text}」</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#6366f1", background: "#6366f115", padding: "2px 8px", borderRadius: 4 }}>{q.purpose}</span>
                        {q.risk && q.risk !== "null" && <span style={{ fontSize: 11, color: "#f59e0b", background: "#f59e0b15", padding: "2px 8px", borderRadius: 4 }}>注意：{q.risk}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 次フェーズへの移行ボタン（AIが提案した場合のみ表示） */}
                {nextPhaseObj && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 10 }}>フェーズ移行の提案</div>
                    <button onClick={() => { setPhase(nextPhaseObj.id); setSituation(""); setCoachingResult(null); }} style={{ width: "100%", padding: "11px", background: nextPhaseObj.color + "15", border: "1px solid " + nextPhaseObj.color + "50", color: nextPhaseObj.color, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {nextPhaseObj.label} に進む →
                    </button>
                  </div>
                )}

                {/* 同じフェーズで続けるボタン */}
                <button onClick={() => { setSituation(""); setCoachingResult(null); }} style={{ width: "100%", marginTop: 10, padding: "11px", background: "transparent", border: "1px solid #1e1e2e", color: "#555", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                  同じフェーズで続ける
                </button>
              </div>
            )}
          </div>
        )}

        {/* 目標・タスク分解タブ */}
        {activeTab === "goal" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 8 }}>生徒の興味・現状</div>
              <textarea value={goalInput} onChange={e => setGoalInput(e.target.value)} placeholder="例：フランスの美大を目指して浪人中。将来アパレルブランドを作りたいけど、何から始めればいいかわからない。" style={{ width: "100%", minHeight: 110, background: "#15151f", border: "1px solid #1e1e2e", borderRadius: 10, color: "#e8e8f0", fontSize: 14, padding: "14px 16px", resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {/* 生成ボタン */}
            <button onClick={handleGoalSubmit} disabled={loading || !goalInput.trim()} style={{ width: "100%", padding: "13px", background: loading || !goalInput.trim() ? "#1e1e2e" : "#0ea5e9", color: loading || !goalInput.trim() ? "#444" : "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: loading || !goalInput.trim() ? "not-allowed" : "pointer" }}>
              {loading ? "AI が考え中..." : "目標・タスクを生成"}
            </button>

            {/* 目標・タスク結果 */}
            {goalResult && (
              <div ref={resultRef} style={{ marginTop: 28 }}>
                {/* 興味→目標→プロジェクトの階層表示 */}
                <div style={{ background: "#15151f", border: "1px solid #1e1e2e", borderRadius: 10, padding: "18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      { label: "興味", value: goalResult.interest, color: "#6366f1" },
                      { label: "短期目標", value: goalResult.goal, color: "#0ea5e9" },
                      { label: "プロジェクト", value: goalResult.project, color: "#10b981" },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 11, color: item.color, background: item.color + "18", padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 2 }}>{item.label}</span>
                        <span style={{ fontSize: 14, lineHeight: 1.6, color: "#e0e0f0" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 今週のタスク */}
                <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 12 }}>今週のタスク</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {goalResult.tasks?.map((t, i) => (
                    <div key={i} style={{ background: "#15151f", border: "1px solid #1e1e2e", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 14, color: "#e0e0f0", marginBottom: 6 }}>{"0" + (i + 1) + "  " + t.text}</div>
                      <span style={{ fontSize: 11, color: "#0ea5e9", background: "#0ea5e918", padding: "2px 8px", borderRadius: 4 }}>{t.why}</span>
                    </div>
                  ))}
                </div>

                {/* 明日の1アクション */}
                <div style={{ background: "#0f1f18", border: "1px solid #10b98140", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#10b981", letterSpacing: "0.1em", marginBottom: 8 }}>明日できる最初の1アクション</div>
                  <div style={{ fontSize: 15, color: "#e0e0f0", lineHeight: 1.6 }}>{goalResult.firstAction}</div>
                </div>

                {/* アラート */}
                {goalResult.alert && goalResult.alert !== "null" && (
                  <div style={{ padding: "12px 16px", background: "#1a1510", border: "1px solid #78350f", borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.6 }}>{goalResult.alert}</span>
                  </div>
                )}

                {/* 別の生徒で試すボタン */}
                <button onClick={() => { setGoalInput(""); setGoalResult(null); }} style={{ width: "100%", marginTop: 16, padding: "11px", background: "transparent", border: "1px solid #1e1e2e", color: "#555", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                  別の生徒で試す
                </button>
              </div>
            )}
          </div>
        )}

        {/* エラー表示（タブ共通） */}
        {error && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#2a1010", border: "1px solid #5a2020", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
