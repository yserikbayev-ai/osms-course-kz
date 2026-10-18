// Озвучка ElevenLabs с таймкодами слов. Кэш по хэшу текста: повторный запуск
// не тратит символы квоты. Ключ — ~/.config/elevenlabs/.env (ELEVENLABS_API_KEY),
// запасной путь — ~/.config/content-factory/.env. Голос — ELEVENLABS_VOICE_ID или MARIIA_R.
// Запуск: node scripts/tts.mjs L1.2
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const id = process.argv[2];
if (!id) throw new Error('Использование: node scripts/tts.mjs <id урока>');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[2].trim()) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = {...readEnv(path.join(os.homedir(), '.config/content-factory/.env')), ...readEnv(path.join(os.homedir(), '.config/elevenlabs/.env'))};
const apiKey = env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error('Нет ELEVENLABS_API_KEY ни в ~/.config/elevenlabs/.env, ни в ~/.config/content-factory/.env');
const voiceId = env.ELEVENLABS_VOICE_ID || 'EDpEYNf6XIeKYRzYcx4I'; // MARIIA_R — русский, профессиональный

const propsFile = path.join(root, 'props', `${id}.json`);
const props = JSON.parse(fs.readFileSync(propsFile, 'utf8'));
const story = JSON.parse(fs.readFileSync(path.join(root, 'props', `${id}.story.json`), 'utf8'));
const SPEED = Number(story.voice.speed ?? 1.0); // темп речи ElevenLabs 0.7–1.2, поле story.voice.speed
const audioDir = path.join(root, 'public', 'audio', id);
fs.mkdirSync(audioDir, {recursive: true});

function wordsFromAlignment(text, al, parts) {
  // alignment — по символам; собираем слова по пробелам, часть (norm/plain) — по смещению в тексте.
  const bounds = [];
  let off = 0;
  for (const p of parts || [{part: 'voice', text}]) { bounds.push({part: p.part, from: off, to: off + p.text.length}); off += p.text.length + 1; }
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = {w: '', s: al.character_start_times_seconds[i], e: 0, i};
    cur.w += ch;
    cur.e = al.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  for (const w of words) { w.part = (bounds.find((b) => w.i >= b.from && w.i < b.to) || bounds[bounds.length - 1]).part; delete w.i; }
  return words;
}

let spent = 0;
async function synth(text, parts) {
  const hash = crypto.createHash('sha1').update(`${voiceId}|${SPEED}|${text}`).digest('hex').slice(0, 12);
  const mp3 = path.join(audioDir, `${hash}.mp3`);
  const meta = path.join(audioDir, `${hash}.json`);
  if (!fs.existsSync(mp3) || !fs.existsSync(meta)) {
    console.log(`  ElevenLabs: ${text.length} символов → ${hash}.mp3`);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {'xi-api-key': apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        text, model_id: 'eleven_multilingual_v2', output_format: 'mp3_44100_128',
        voice_settings: {stability: 0.55, similarity_boost: 0.8, style: 0.15, speed: SPEED},
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
    fs.writeFileSync(meta, JSON.stringify({text, alignment: j.alignment}));
    spent += text.length;
  }
  const {alignment} = JSON.parse(fs.readFileSync(meta, 'utf8'));
  const durationSec = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString().trim());
  return {file: `audio/${id}/${hash}.mp3`, durationSec: Math.round(durationSec * 1000) / 1000, chars: text.length, words: wordsFromAlignment(text, alignment, parts)};
}

props.opener.audio = await synth(props.opener.voiceText);
if (props.opener.cutAfter) { // опенер — 4 с: голос обрезаем после заданного слова, остальное не звучит
  const a = props.opener.audio;
  const i = a.words.findIndex((w) => w.w === props.opener.cutAfter);
  if (i < 0) throw new Error(`cutAfter «${props.opener.cutAfter}» не найден в озвучке опенера`);
  a.words = a.words.slice(0, i + 1);
  a.durationSec = Math.round((a.words[i].e + 0.25) * 1000) / 1000;
}
for (const s of props.scenes) s.audio = await synth(s.voiceText, s.parts);
props.summary.audio = await synth(props.summary.voiceText);
fs.writeFileSync(propsFile, JSON.stringify(props, null, 2));
const total = [props.opener, ...props.scenes, props.summary].reduce((a, s) => a + s.audio.chars, 0);
const dur = [props.opener, ...props.scenes, props.summary].map((s) => s.audio.durationSec);
console.log(`озвучка: ${total} символов всего, новых потрачено ${spent}; длительности, с: ${dur.join(', ')}`);
