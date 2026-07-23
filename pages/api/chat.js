// ==============================================
// APIルート：Anthropic APIへのリクエストを中継
// APIキーはここでのみ使用。フロントには公開しない
// ==============================================

export default async function handler(req, res) {
  // POST以外のリクエストは拒否
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // フロントから受け取るのはmessages（会話履歴）とsystem（プロンプト）
  const { messages, system } = req.body;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // APIキーは環境変数から読み込む（Vercelの管理画面で設定）
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", // 使用するClaudeのモデル
        max_tokens: 1000,           // 返答の最大トークン数
        system,                     // システムプロンプト（メイキットの思想・ルール）
        messages,                   // 会話履歴（セッション中の入力を蓄積）
      }),
    });

    const data = await response.json();
    // Anthropic APIのレスポンスをそのままフロントに返す
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "APIエラーが発生しました" });
  }
}
