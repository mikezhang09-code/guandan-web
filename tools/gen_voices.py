#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用百度语音合成(TTS) 批量生成游戏里所有固定语音，存为 mp3 文件，
并生成 voices.js 清单供 guandan.html / shengji.html 直接引用。

用法:
    export BAIDU_TTS_API_KEY=你的APIKey
    export BAIDU_TTS_SECRET_KEY=你的SecretKey
    python3 tools/gen_voices.py

或:
    python3 tools/gen_voices.py <API_KEY> <SECRET_KEY>

输出:
    voices/<seat>/<index>.mp3   (seat = 0..3, index 对应 PHRASES 下标)
    voices.js                    (window.VOICE_PHRASES / VOICE_BASE 清单)
"""
import os
import sys
import json
import time
import requests

# 4 个座位用 4 种不同发音人 (百度免费基础音库)
#   0 度小美(成熟女声)  1 度小宇(成熟男声)  3 度逍遥(情感男声)  4 度丫丫(童声女)
SEAT_PER = [0, 1, 3, 4]

TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token"
TTS_URL = "https://tsn.baidu.com/text2audio"

VALUES = ["二", "三", "四", "五", "六", "七", "八", "九", "十",
          "j", "q", "k", "a", "小王", "大王"]

# 个别短语在清单里的 key 保持不变(运行时按 key 查文件), 但合成时改用别的发音文本。
# 例: 扑克 A 应念字母音"诶(ēi)", 而百度会把小写 "a" 当拼音读成"啊", 故替换。
SPOKEN_TEXT = {"a": "诶"}


def spoken(text):
    """把短语里的 'a' 替换成发音用的 '诶', 其余原样。"""
    out = text
    for k, v in SPOKEN_TEXT.items():
        out = out.replace(k, v)
    return out


def build_phrases():
    """枚举两个游戏会播报的全部固定短语 (顺序即文件索引, 不要随意改顺序)。"""
    seen = []

    def add(s):
        if s not in seen:
            seen.append(s)

    # 单张点数 (掼蛋单张 / 升级跟主)
    for v in VALUES:
        add(v)
    # 掼蛋: 对X / 三个X
    for v in VALUES:
        add("对" + v)
    for v in VALUES:
        add("三个" + v)
    # 升级: 单X
    for v in VALUES:
        add("单" + v)
    # 掼蛋牌型
    for s in ["三带二", "顺子", "三连对", "钢板", "同花顺", "四王炸"]:
        add(s)
    # 炸弹张数
    for n in range(4, 13):
        add(f"{n}炸")
    # 剩牌提示 (运行时与基础短语拼接播放)
    add("剩一张")
    add("剩两张")
    # 不出
    for s in ["不出", "不要", "要不起", "过"]:
        add(s)
    # 进贡 / 还贡
    for s in ["抗贡！", "进贡", "请还贡"]:
        add(s)
    # 升级: 亮主 / 埋底 / 牌型
    for s in ["亮无主", "亮黑桃", "亮红桃", "亮梅花", "亮方块", "埋底",
              "拖拉机", "甩牌", "毙了"]:
        add(s)
    # 升级: 单独花色名(出牌报"花色+点数") + 反主 + 单独"对"(对子报"对+花色+点数")
    #   注意: 新增项必须追加在末尾, 以免改动已生成文件的索引
    for s in ["黑桃", "红桃", "梅花", "方块", "反主", "对"]:
        add(s)
    return seen


def get_token(api_key, secret_key):
    r = requests.get(TOKEN_URL, params={
        "grant_type": "client_credentials",
        "client_id": api_key,
        "client_secret": secret_key,
    }, timeout=15)
    r.raise_for_status()
    data = r.json()
    if "access_token" not in data:
        raise SystemExit(f"获取 token 失败: {data}")
    return data["access_token"]


def synth(token, text, per):
    """调用 text2audio, 返回 mp3 bytes; 失败抛异常。"""
    params = {
        "tex": text,
        "tok": token,
        "cuid": "guandan-web-voicegen",
        "ctp": 1,
        "lan": "zh",
        "spd": 5,      # 语速 0-15
        "pit": 5,      # 音调 0-15
        "vol": 8,      # 音量 0-15
        "per": per,    # 发音人
        "aue": 3,      # 3 = mp3
    }
    r = requests.post(TTS_URL, data=params, timeout=20)
    ctype = r.headers.get("Content-Type", "")
    if "audio" not in ctype:
        # 出错时百度返回 json
        raise RuntimeError(f"TTS 失败 text={text!r}: {r.content[:200]!r}")
    return r.content


def main():
    api_key = os.environ.get("BAIDU_TTS_API_KEY")
    secret_key = os.environ.get("BAIDU_TTS_SECRET_KEY")
    if len(sys.argv) >= 3:
        api_key, secret_key = sys.argv[1], sys.argv[2]
    if not api_key or not secret_key:
        raise SystemExit("缺少凭证: 设置 BAIDU_TTS_API_KEY / BAIDU_TTS_SECRET_KEY 或作为参数传入")

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    phrases = build_phrases()
    print(f"共 {len(phrases)} 条短语 × {len(SEAT_PER)} 个音色 = {len(phrases)*len(SEAT_PER)} 个文件")

    token = get_token(api_key, secret_key)
    print("token ok")

    total = 0
    for seat, per in enumerate(SEAT_PER):
        outdir = os.path.join(root, "voices", str(seat))
        os.makedirs(outdir, exist_ok=True)
        for idx, text in enumerate(phrases):
            path = os.path.join(outdir, f"{idx}.mp3")
            if os.path.exists(path) and os.path.getsize(path) > 0:
                continue
            for attempt in range(3):
                try:
                    audio = synth(token, spoken(text), per)
                    with open(path, "wb") as f:
                        f.write(audio)
                    total += 1
                    break
                except Exception as e:
                    if attempt == 2:
                        print(f"  ✗ seat{seat} {text!r}: {e}")
                    else:
                        time.sleep(1.0)
            time.sleep(0.12)  # 限速, 避免 QPS 超限
        print(f"座位 {seat} (per={per}) 完成")

    # 写清单
    voices_js = os.path.join(root, "voices.js")
    with open(voices_js, "w", encoding="utf-8") as f:
        f.write("/* 由 tools/gen_voices.py 自动生成, 请勿手改。 */\n")
        f.write("window.VOICE_BASE = 'voices/';\n")
        f.write("window.VOICE_PHRASES = " +
                json.dumps(phrases, ensure_ascii=False) + ";\n")
    print(f"已写出 {voices_js}; 本次新生成 {total} 个 mp3")


if __name__ == "__main__":
    main()
