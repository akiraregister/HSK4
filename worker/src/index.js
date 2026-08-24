// HSK4 作文採点 Worker
//
// 守り方の考え方：
//   出題文と模範解答は「このWorkerが持っているもの」だけを使う。クライアントから
//   受け取るのは「何日目の何問目か」と「利用者が書いた中文」の3つだけにしてある。
//   以前は出題文そのものを送らせていたので、そこに任意の指示を入れれば汎用の
//   LLMとして使えてしまった。日と番号しか受け取らなければ、投げられるのは
//   こちらが用意した180問への答えだけになる。
//
// CORS は鍵ではない。ブラウザが自主的に守る仕組みなので、curl には効かない。
// ここでは許可外の Origin を実際に 403 で落とす（それでも Origin は詐称できるので、
// 費用の歯止めは下の回数制限のほうが本体）。

import { WRITING } from './writing-bank.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_USER_ZH = 200;        // 作文1問の答えとしては十分な長さ
const DAILY_LIMIT = 30;         // IPごと・1日あたり。RATE_LIMIT を繋いだときだけ効く

const ALLOWED_ORIGINS = [
  'https://akiraregister.github.io',
  'null',                       // file:// で開いたローカルHTML
];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

// KV を繋いでいなければ素通しする。繋ぐ手順は worker/README.md に書いてある。
// KV は結果整合なので厳密な回数にはならないが、費用の歯止めとしてはこれで足りる。
async function withinLimit(env, ip) {
  if (!env.RATE_LIMIT || !ip) return true;
  const key = `d:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = Number(await env.RATE_LIMIT.get(key)) || 0;
  if (used >= DAILY_LIMIT) return false;
  await env.RATE_LIMIT.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

function pickQuestion(day, idx) {
  const d = WRITING[String(day)];
  if (!d) return null;
  const w = d.writing[idx];
  if (!w) return null;
  return { prompt: w.prompt, answer: w.answer, vocab: d.vocab, grammar: d.grammar };
}

const SYSTEM = 'あなたはHSK4レベルの中国語作文を採点する、親切で正確な中国語教師です。'
  + '学習者は日本語話者です。出力は必ず指定のJSONのみ。前置きや説明文、コードフェンスは一切付けないこと。';

function buildUserMessage(q, userZh) {
  return [
    '次の和文中訳問題を採点してください。',
    '',
    `【出題(日本語)】${q.prompt}`,
    `【模範解答(中文)】${q.answer || '(なし)'}`,
    `【学習者の解答(中文)】${userZh}`,
    q.vocab.length ? `【この課の語彙】${q.vocab.join('、')}` : '',
    q.grammar.length ? `【この課の文法】${q.grammar.join('、')}` : '',
    '',
    '採点方針:',
    '- 模範解答と一字一句同じである必要はない。意味が正しく自然な中文なら correct。',
    '- 文法・語順は概ね正しいが不自然・冗長・やや不適切な語選びがあれば acceptable。',
    '- 意味が伝わらない/重大な文法誤り/未完成なら incorrect。',
    '- comment は日本語で1〜2文。なぜその判定かと、直すべき点を具体的に。',
    '- corrected には最も自然な中文を1つ入れる(学習者の解答が完璧ならそれと同じでよい)。',
    '',
    'JSONスキーマ: {"verdict":"correct|acceptable|incorrect","score":0-100の整数,"comment":"日本語","corrected":"中文"}',
  ].filter(Boolean).join('\n');
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Use POST' }, 405, origin);
    }
    if (!isAllowedOrigin(origin)) {
      return json({ error: 'このエンドポイントは加油アプリ専用です' }, 403, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!(await withinLimit(env, ip))) {
      return json({ error: `採点は1日${DAILY_LIMIT}回までです。明日また試してください。` }, 429, origin);
    }

    let data;
    try { data = await request.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400, origin); }

    const day = Number(data.day);
    const idx = Number(data.idx);
    const userZh = String(data.user_zh || '').trim();

    if (!Number.isInteger(day) || !Number.isInteger(idx)) {
      // 古い形式（出題文をそのまま送ってくる版）のアプリはここに来る
      return json({ error: 'アプリを再読み込みしてから、もう一度お試しください。' }, 400, origin);
    }
    if (!userZh) {
      return json({ error: '解答が空です' }, 400, origin);
    }
    if (userZh.length > MAX_USER_ZH) {
      return json({ error: `解答は${MAX_USER_ZH}文字以内で入力してください` }, 400, origin);
    }

    const q = pickQuestion(day, idx);
    if (!q) {
      return json({ error: 'その問題は見つかりませんでした' }, 404, origin);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'サーバー側でAPIキーが未設定です' }, 500, origin);
    }

    let resp;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          system: SYSTEM,
          messages: [{ role: 'user', content: buildUserMessage(q, userZh) }],
        }),
      });
    } catch {
      return json({ error: '採点サーバーへの接続に失敗しました' }, 502, origin);
    }

    if (!resp.ok) {
      // 上流のエラー本文は利用者に返さない。中身次第で内部情報が漏れるため、ログにだけ残す。
      console.error('anthropic error', resp.status, (await resp.text().catch(() => '')).slice(0, 500));
      return json({ error: '採点に失敗しました。しばらくしてからもう一度お試しください。' }, 502, origin);
    }

    let payload;
    try { payload = await resp.json(); }
    catch { return json({ error: '採点結果を解析できませんでした' }, 502, origin); }

    const text = (payload.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const parsed = extractJson(text);
    if (!parsed) {
      return json({ verdict: 'acceptable', score: 60,
        comment: text.slice(0, 200) || '採点結果を解析できませんでした。',
        corrected: q.answer }, 200, origin);
    }

    const verdict = ['correct', 'acceptable', 'incorrect'].includes(parsed.verdict) ? parsed.verdict : 'acceptable';
    let score = Number(parsed.score);
    if (!Number.isFinite(score)) score = verdict === 'correct' ? 100 : verdict === 'acceptable' ? 70 : 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return json({
      verdict,
      score,
      comment: String(parsed.comment || '').slice(0, 400),
      corrected: String(parsed.corrected || q.answer || '').slice(0, 400),
    }, 200, origin);
  },
};
