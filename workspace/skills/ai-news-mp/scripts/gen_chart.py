#!/usr/bin/env python3
"""生成正文数据图（PNG，1080px 宽），自动带标题与「数据来源」标注。

用法：
  python3 gen_chart.py --data '<JSON>'
  python3 gen_chart.py --data-file /tmp/chart.json

JSON 字段：
  type: bar | hbar | line     # 竖向条形 / 横向条形 / 折线（可多系列）
  title: 图表标题（必填）
  data:
    bar/hbar: {"标签": 数值, ...}
    line:     {"x": [...], "series": {"系列名": [值, ...], ...}}
  highlight: bar/hbar 时要高亮的主角标签（橙色 #FF6622，其余灰色）
  ylabel / xlabel: 可选坐标轴名
  source: 数据来源（必填，印在左下角，如「数据来源：OpenAI 官方定价」）
  out: 输出 PNG 路径（默认 /tmp/chart-<时间戳>.png）

依赖：python3-matplotlib、fonts-noto-cjk（缺啥装啥：sudo apt-get install -y python3-matplotlib fonts-noto-cjk）。
数据必须与来源一致，不得为视觉效果歪曲比例；调用方负责核对数字。
"""
import argparse
import json
import sys
import time

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    print("缺少 matplotlib：sudo apt-get install -y python3-matplotlib", file=sys.stderr)
    sys.exit(1)

ORANGE = "#FF6622"
GRAY = "#b0b0b0"
DARK = "#333333"


def setup_font():
    import glob
    import os
    from matplotlib import font_manager

    # 首选：从系统 ttc 抽取出的 SC 字面（见 README 部署步骤）；其次系统 ttc 自带的 JP 面
    for p in sorted(glob.glob(os.path.expanduser("~/.local/share/fonts/NotoSansCJKsc-*.ttf"))):
        try:
            font_manager.fontManager.addfont(p)
        except Exception:
            pass
    try:
        font_manager.fontManager.addfont("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
    except Exception:
        pass
    names = [f.name for f in font_manager.fontManager.ttflist]
    for want in ("Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Zen Hei", "Source Han Sans SC",
                 "Noto Sans CJK JP", "Noto Sans CJK"):
        if want in names:
            plt.rcParams["font.family"] = want
            return want
    print("未找到中文字体：sudo apt-get install -y fonts-noto-cjk python3-fonttools，"
          "并按 README 抽取 SC 字面到 ~/.local/share/fonts/", file=sys.stderr)
    sys.exit(1)


def fmt(v):
    return f"{v:g}"


def render(cfg, out):
    setup_font()
    t = cfg.get("type", "bar")
    title = cfg.get("title", "")
    source = cfg.get("source", "")
    if not title or not source:
        print("title 和 source 必填（来源标注是硬要求）", file=sys.stderr)
        sys.exit(1)

    fig, ax = plt.subplots(figsize=(10.8, 5.4), dpi=100)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    if t in ("bar", "hbar"):
        data = cfg.get("data")
        if not isinstance(data, dict) or not data:
            print("bar/hbar 需要 data 为 {标签: 数值} 且非空", file=sys.stderr)
            sys.exit(1)
        labels = list(data.keys())
        values = [data[k] for k in labels]
        hl = cfg.get("highlight")
        colors = [ORANGE if k == hl else GRAY for k in labels]
        if t == "bar":
            bars = ax.bar(labels, values, color=colors, width=0.6)
            for b, v in zip(bars, values):
                ax.text(b.get_x() + b.get_width() / 2, v, fmt(v), ha="center", va="bottom",
                        fontsize=13, color=DARK, fontweight="bold")
            grid_axis = "y"
        else:
            rlabels = labels[::-1]
            rvalues = values[::-1]
            bars = ax.barh(rlabels, rvalues, color=colors[::-1], height=0.62)
            for b, v in zip(bars, rvalues):
                ax.text(v, b.get_y() + b.get_height() / 2, " " + fmt(v), va="center", ha="left",
                        fontsize=13, color=DARK, fontweight="bold")
            ax.margins(x=0.12)
            grid_axis = "x"
    elif t == "line":
        data = cfg.get("data") or {}
        xs = data.get("x") or []
        series = data.get("series") or {}
        if not xs or not series:
            print("line 需要 data.x 和 data.series", file=sys.stderr)
            sys.exit(1)
        palette = [ORANGE, GRAY, "#888888", "#555555"]
        for i, (name, ys) in enumerate(series.items()):
            ax.plot(xs, ys, marker="o", color=palette[i % len(palette)], label=name,
                    linewidth=2.4, markersize=5)
        ax.legend(frameon=False, fontsize=12)
        grid_axis = "y"
    else:
        print(f"不支持的 type: {t}（支持 bar / hbar / line）", file=sys.stderr)
        sys.exit(1)

    if cfg.get("ylabel"):
        ax.set_ylabel(cfg["ylabel"], fontsize=12, color=DARK)
    if cfg.get("xlabel"):
        ax.set_xlabel(cfg["xlabel"], fontsize=12, color=DARK)
    ax.set_title(title, fontsize=16, color=DARK, fontweight="bold", loc="left", pad=14)
    ax.tick_params(colors=DARK, labelsize=12)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#dddddd")
    ax.spines["bottom"].set_color("#dddddd")
    ax.grid(axis=grid_axis, color="#eeeeee", linewidth=0.8)
    ax.set_axisbelow(True)

    fig.text(0.01, 0.015, source, fontsize=11, color="#999999")
    fig.tight_layout(rect=(0, 0.045, 1, 1))
    fig.savefig(out, dpi=100, facecolor="white")
    plt.close(fig)
    print(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--data-file")
    a = ap.parse_args()
    raw = a.data if a.data else (open(a.data_file, encoding="utf-8").read() if a.data_file else "")
    if not raw:
        print("用 --data '<JSON>' 或 --data-file 文件 传入配置", file=sys.stderr)
        sys.exit(1)
    cfg = json.loads(raw)
    out = cfg.get("out") or "/tmp/chart-%d.png" % int(time.time())
    render(cfg, out)


main()
