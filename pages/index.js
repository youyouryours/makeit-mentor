import { useState, useRef } from "react";

// フェーズ定義：メイキットの面談5ステップ
const PHASES = [
  { id: "clarify",  label: "① 言語化",   color: "#6366f1", desc: "やりたいことを具体化する" },
  { id: "design",   label: "② 設計",     color: "#0ea5e9", desc: "動くための準備をする" },
  { id: "revise",   label: "③ 修正",     color: "#f59e0b", desc: "フィードバックと次の動き" },
  { id: "execute",  label: "④ 実行",     color: "#10b981", desc: "やる・記録・振り返る" },
  { id: "redirect", label: "⑤ 方向修正", color: "#ef4444", desc: "再び行動に戻す" },
];

// システムプロンプト：声かけ生成用
// 配列+joinはテンプレートリテラルの構文エラーを避けるため
const SYSTEM_PROMPT = [
  "あなたはRE:ACTION FIREの伴走セッションにおける、メンター向けコパイロットAIです。",
  "RE:ACTION FIREとは：高校生が自分の「好き」を起点に社会課題の解決に挑む3ヶ月の実践プログラム（9〜11月）。合宿で企画を立て、伴走期間で実行し、1月のフィナーレで発表する。",
  "生徒の状況：個人で活動。合宿で企画を立てたが、まだ固まっていない生徒もいる。",
  "メンターの役割：答えを教えず、生徒が自分で考えて動けるよう問いを立てる。好き×社会課題という文脈を大切にする。",
  "重要：生徒はすでに企画のテーマを持っている前提で接する。ただし企画が曖昧な場合は言語化を優先する。",
  "4つの階層で考える：興味（好き×社会課題）→目標（何を実現したいか）→プロジェクト（具体的な企画）→タスク（今週やること）。",
  "【①言語化フェーズ】目的：企画・やりたいことを具体化する。注意：深掘りで手が止まるのを防ぐ。好きなことと社会課題のつながりを本人の言葉で引き出す。",
  "【②設計フェーズ】目的：明日やることが1つ決まっている状態にする。注意：比較は3案まで・完璧禁止・小さく始めることを優先。",
  "【③修正フェーズ】目的：次の1アクションが明確になっている状態。注意：評価しない・褒めすぎない・まず実行してからフィードバック。",
  "【④実行フェーズ】目的：実行→記録→振り返りのサイクルを回す。注意：振り返りを必須にする。できた/できなかったを責めない。",
  "【⑤方向修正フェーズ】目的：止まっている状態から次の1アクションが決まっている状態に戻す。注意：否定せずスモールステップに戻す。企画のピボットも選択肢として提示してよい。",
  "【テンション考慮】テンションが1〜2の場合：提案より先に共感・受容を示す。まず話を聞く姿勢を優先する。",
  "【詰まり考慮】難しいと感じている点が入力されている場合：その詰まりを一緒に分解する方向で質問を組み立てる。",
  "【フィナーレ意識】11月末に向けて発表・アウトプットにつながる動きを意識した声かけをする。ただし焦らせない。",
  "メンターが入力した生徒の状況をもとに、フェーズを自動判定して以下のJSON形式のみで返してください。マークダウン不要。",
  '{"detectedPhase":"clarify/design/revise/execute/redirectのいずれか","phaseReason":"判断理由1文","questions":[{"text":"声かけ","purpose":"理由15字以内","risk":"注意点またはnull"},{"text":"声かけ","purpose":"理由15字以内","risk":null},{"text":"声かけ","purpose":"理由15字以内","risk":null}],"alert":"注意点またはnull","nextPhase":"次フェーズIDまたはnull"}',
].join("\n");

// システムプロンプト：目標設定・タスク分解用
const GOAL_PROMPT = [
  "あなたはRE:ACTION FIREの伴走セッションにおける目標設定・タスク分解の専門AIです。",
  "RE:ACTION FIREとは：高校生が自分の「好き」を起点に社会課題の解決に挑む3ヶ月の実践プログラム（9〜11月）。1月のフィナーレで発表する。",
  "生徒の状況：個人で活動。合宿で企画を立てたが、まだ固まっていない生徒もいる。",
  "原則：企画がある場合はそれを実行するロードマップを作る。企画が曖昧な場合は言語化・具体化を最初のステップにする。タスクは今週できるレベルまで小さくする。完璧を求めない。",
  "期間感：9〜11月の3ヶ月。1月フィナーレに向けて逆算してロードマップを設計する。",
  "4つの階層：興味（好き×社会課題）→目標→プロジェクト→タスク。",
  "【テンション考慮】テンションが1〜2の場合：タスクをより小さく・簡単なものに設定する。まず動けることを最優先にする。",
  "【詰まり考慮】難しいと感じている点がある場合：その詰まりを解消するタスクを最初に置く。",
  "【ロードマップ設計】生徒の企画・進行度・詰まりポイントをもとに、5〜6ステップの個別ロードマップを生成する。企画が固まっていない場合は最初のステップを言語化・具体化にする。各ステップにタスクを2〜3個紐づける。currentステップが今週、upcomingが来週以降。",
  "【フィナーレ意識】最後のステップは必ず1月フィナーレに向けた発表・アウトプット準備にする。",
  "以下のJSON形式のみで返してください。マークダウン不要。",
  '{"interest":"好き×社会課題を一言で","goal":"3ヶ月で実現したいこと","project":"具体的な企画名","roadmap":[{"step":1,"title":"ステップタイトル","status":"done","tasks":[]},{"step":2,"title":"ステップタイトル","status":"current","tasks":[{"text":"タスク1","why":"理由15字以内"},{"text":"タスク2","why":"理由15字以内"},{"text":"タスク3","why":"理由15字以内"}]},{"step":3,"title":"ステップタイトル","status":"upcoming","tasks":[{"text":"タスク1","why":"理由15字以内"},{"text":"タスク2","why":"理由15字以内"}]},{"step":4,"title":"ステップタイトル","status":"upcoming","tasks":[{"text":"タスク1","why":"理由15字以内"}]},{"step":5,"title":"フィナーレ発表準備","status":"upcoming","tasks":[{"text":"タスク1","why":"理由15字以内"}]}],"firstAction":"明日できる最初の1アクション","alert":"メンターへの注意点またはnull"}',
].join("\n");

export default function MentorCopilot() {
  // タブ管理
  const [activeTab, setActiveTab] = useState("coaching");
  const [studentName, setStudentName] = useState("");

  // 声かけ生成の状態
  const [phase] = useState("clarify");
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
　// 生徒名が変わったら自動でセッションをリセット
  function handleStudentNameChange(newName) {
    if (newName !== studentName) {
      setCoachingHistory([]);
      setCoachingResult(null);
      setGoalResult(null);
      setSituation("");
      setGoalInput("");
      setError(null);
    }
    setStudentName(newName);
  }
  // APIリクエスト共通関数
  // /api/chat経由でAPIキーを隠す
  async function callAPI(system, messages) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages }),
    });
    const data = await response.json();
    const text = data.content?.map(i => i.text || "").join("") || "";
    const clean = text.replace(/```json[\r\n]*/g, "").replace(/```[\r\n]*/g, "").trim();
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
    setCoachingHistory([]);
    setPhase("clarify");
    setGoalInput("");
    setGoalResult(null);
    setError(null);
    setStudentName("");
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
        {/* 生徒名入力（変更時に自動リセット） */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 8 }}>生徒名</div>
          <input
            type="text"
            value={studentName}
            onChange={e => handleStudentNameChange(e.target.value)}
            placeholder="例：田中さん"
            style={{ width: "100%", background: "#15151f", border: "1px solid #1e1e2e", borderRadius: 10, color: "#e8e8f0", fontSize: 14, padding: "12px 16px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
          {studentName && (
            <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
              ※ 生徒名を変更すると会話履歴が自動でリセットされます
            </div>
          )}
        </div>
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
                {/* フェーズ自動判定 */}
                {detectedPhaseObj && coachingResult.detectedPhase !== phase && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", background: detectedPhaseObj.color + "12", border: "1px solid " + detectedPhaseObj.color + "40", borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: detectedPhaseObj.color, fontWeight: 600 }}>AIの判定：{detectedPhaseObj.label}</span>
                    <span style={{ color: "#666", marginLeft: 8 }}>{coachingResult.phaseReason}</span>
                  </div>
                )}

                {/* アラート */}
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
                      {i === 0 && <div style={{ position: "absolute", top: -1, left: 14, background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "0 0 6px 6px" }}>推奨</div>}
                      <div style={{ fontSize: 15, lineHeight: 1.7, color: "#e0e0f0", marginTop: i === 0 ? 8 : 0, marginBottom: 10 }}>「{q.text}」</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#6366f1", background: "#6366f115", padding: "2px 8px", borderRadius: 4 }}>{q.purpose}</span>
                        {q.risk && q.risk !== "null" && <span style={{ fontSize: 11, color: "#f59e0b", background: "#f59e0b15", padding: "2px 8px", borderRadius: 4 }}>注意：{q.risk}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 次フェーズ移行ボタン */}
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

                {/* ロードマップ（タスク紐づき） */}
                {goalResult.roadmap && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 12 }}>ロードマップ</div>
                    <div style={{ background: "#15151f", border: "1px solid #1e1e2e", borderRadius: 10, padding: "18px" }}>
                      {goalResult.roadmap.map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: i < goalResult.roadmap.length - 1 ? 20 : 0 }}>

                          {/* 縦線とアイコン */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
                              background: item.status === "done" ? "#10b981" : item.status === "current" ? "#6366f1" : "#1e1e2e",
                              color: item.status === "upcoming" ? "#444" : "#fff",
                              boxShadow: item.status === "current" ? "0 0 10px #6366f180" : "none",
                            }}>
                              {item.status === "done" ? "✓" : item.step}
                            </div>
                            {i < goalResult.roadmap.length - 1 && (
                              <div style={{ width: 1, flexGrow: 1, minHeight: 16, background: item.status === "done" ? "#10b98150" : "#1e1e2e", marginTop: 4 }} />
                            )}
                          </div>

                          {/* ステップ内容 */}
                          <div style={{ paddingTop: 4, flex: 1, paddingBottom: 8 }}>
                            {/* ステップタイトル */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: item.tasks && item.tasks.length > 0 ? 10 : 0 }}>
                              {item.status === "current" && <span style={{ fontSize: 14 }}>👉</span>}
                              <span style={{
                                fontSize: 13, fontWeight: item.status === "current" ? 600 : 400,
                                color: item.status === "done" ? "#10b981" : item.status === "current" ? "#e0e0f0" : "#444",
                              }}>
                                {item.title}
                              </span>
                              {item.status === "current" && (
                                <span style={{ fontSize: 10, color: "#6366f1", background: "#6366f120", padding: "2px 6px", borderRadius: 4 }}>今ここ</span>
                              )}
                            </div>

                            {/* タスクリスト（currentとupcomingのみ表示） */}
                            {item.tasks && item.tasks.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {item.tasks.map((t, j) => (
                                  <div key={j} style={{
                                    background: item.status === "current" ? "#0f0f1a" : "#0d0d12",
                                    border: item.status === "current" ? "1px solid #2e2e4a" : "1px solid #1a1a2a",
                                    borderRadius: 8, padding: "10px 12px",
                                  }}>
                                    <div style={{ fontSize: 13, color: item.status === "current" ? "#e0e0f0" : "#555", marginBottom: 4 }}>
                                      {item.status === "current" ? "▸ " : "· "}{t.text}
                                    </div>
                                    <span style={{
                                      fontSize: 11, padding: "2px 8px", borderRadius: 4,
                                      color: item.status === "current" ? "#0ea5e9" : "#444",
                                      background: item.status === "current" ? "#0ea5e918" : "#1a1a2a",
                                    }}>
                                      {t.why}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
